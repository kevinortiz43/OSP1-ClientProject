import React, { useEffect, useMemo, useState } from 'react'

import allTrustControls from '../../server/data/allTrustControls.json'
import allTrustFaqs from '../../server/data/allTrustFaqs.json'

type Control = { id: string; short?: string; long?: string }
type Category = { id: string; label: string; items: Control[] }

type Faq = { id: string; question?: string; answer?: string; category?: string }
type FaqCategory = { id: string; label: string; items: Faq[] }

interface AppProps {
  data?: Category[]
  fetchUrl?: string
}

function App({ data: initialData, fetchUrl }: AppProps) {
  const [categories, setCategories] = useState<Category[]>(initialData ?? [])
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [expandedControlItemId, setExpandedControlItemId] = useState<string | null>(null)
  const [faqCategories, setFaqCategories] = useState<FaqCategory[]>([])
  const [expandedFaqItemId, setExpandedFaqItemId] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) setCategories(initialData)
  }, [initialData])

  const parseControls = (dataRaw: any): Category[] => {
    const edges = dataRaw?.data?.allTrustControls?.edges ?? []
    const byCategory = new Map<string, Control[]>()
    for (const edge of edges) {
      const node = edge.node
      const categoryLabel = node.category ?? 'Uncategorized'
      const itemsForCategory = byCategory.get(categoryLabel) ?? []
      itemsForCategory.push({ id: node.id, short: node.short, long: node.long })
      byCategory.set(categoryLabel, itemsForCategory)
    }
    return Array.from(byCategory.entries()).map(([categoryLabel, items], index) => ({
      id: `${categoryLabel.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      label: categoryLabel,
      items,
    }))
  }

  const parseFaqs = (dataRaw: any): FaqCategory[] => {
    const edges = dataRaw?.data?.allTrustFaqs?.edges ?? dataRaw?.data?.allTrustFaqs ?? dataRaw?.allTrustFaqs ?? []
    const byCategory = new Map<string, Faq[]>()

    const nodes = Array.isArray(edges) && edges.length && edges[0].node ? edges.map((e: any) => e.node) : edges

    for (const node of nodes) {
      if (!node) continue
      const categoryLabel = node.category ?? node.section ?? 'General'
      const itemsForCategory = byCategory.get(categoryLabel) ?? []
      const question = node.question ?? node.short ?? node.title ?? node.q
      const answer = node.answer ?? node.long ?? node.description ?? node.a
      itemsForCategory.push({ id: node.id ?? `${categoryLabel}-${itemsForCategory.length}`, question, answer, category: categoryLabel })
      byCategory.set(categoryLabel, itemsForCategory)
    }

    return Array.from(byCategory.entries()).map(([label, items], index) => ({
      id: `${label.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      label,
      items,
    }))
  }
  useEffect(() => {
    if (initialData || fetchUrl) return
    try {
      const parsedCategories = parseControls(allTrustControls)
      setCategories(parsedCategories)
    } catch (parseError) {
      console.error('error parsing local controls', parseError)
    }
  }, [initialData, fetchUrl])
  useEffect(() => {
    try {
      const parsedFaqCategories = parseFaqs(allTrustFaqs)
      setFaqCategories(parsedFaqCategories)
    } catch (err) {
      console.error('error parsing local faqs', err)
    }
  }, [])

  useEffect(() => {
    if (!fetchUrl) return
    let isMounted = true
    fetch(fetchUrl)
      .then((response) => response.json())
      .then((remoteData) => {
        if (isMounted) setCategories(remoteData)
      })
      .catch((fetchError) => {
        console.error('fetch error', fetchError)
      })
    return () => {
      isMounted = false
    }
  }, [fetchUrl])

  const toggleCategory = (categoryId: string) =>
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId))

  const toggleItem = (itemId: string) =>
    setExpandedControlItemId((prev) => (prev === itemId ? null : itemId))

  const toggleFaqItem = (itemId: string) =>
    setExpandedFaqItemId((prev) => (prev === itemId ? null : itemId))

  const flatFaqItems = useMemo(() => {
    return faqCategories.flatMap((category) =>
      category.items.map((item) => ({ ...item, category: category.label }))
    )
  }, [faqCategories])

  return (
    <div id="root">
      <h1>Trust Controls & FAQs</h1>

      <div className="two-column">
        <section className="column controls-column" aria-label="Trust controls">
          <h2>Trust Controls</h2>
          <div className="accordion">
            {categories.map((category) => (
              <div key={category.id} className="category">
                <button
                  className="category-header"
                  onClick={() => toggleCategory(category.id)}
                  aria-expanded={expandedCategoryId === category.id}
                >
                  {category.label}
                  <span className="caret">{expandedCategoryId === category.id ? '▾' : '▸'}</span>
                </button>

                {expandedCategoryId === category.id && (
                  <ul className="category-list">
                    {category.items.map((controlItem) => (
                      <li key={controlItem.id} className="category-item">
                        <div className="item-row">
                          <span className="item-short">{controlItem.short ?? controlItem.id}</span>
                          <button
                            className="show-answer"
                            onClick={() => toggleItem(controlItem.id)}
                            aria-expanded={expandedControlItemId === controlItem.id}
                          >
                            {expandedControlItemId === controlItem.id ? 'Hide answer' : 'Show answer'}
                          </button>
                        </div>
                        {expandedControlItemId === controlItem.id && (
                          <div className="item-answer">{controlItem.long ?? 'No description'}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="column faqs-column" aria-label="Frequently asked questions">
          <h2>Frequently Asked Questions</h2>
          <ul className="category-list">
            {flatFaqItems.map((faqItem) => (
              <li key={faqItem.id} className="category-item">
                <button
                  className="category-header"
                  onClick={() => toggleFaqItem(faqItem.id)}
                  aria-expanded={expandedFaqItemId === faqItem.id}
                >
                  <span>{faqItem.question ?? 'Untitled question'}</span>
                  <span className="caret">{expandedFaqItemId === faqItem.id ? '▾' : '▸'}</span>
                </button>

                {expandedFaqItemId === faqItem.id && (
                  <div className="item-answer">
                    {faqItem.answer ?? 'No answer available'}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default App