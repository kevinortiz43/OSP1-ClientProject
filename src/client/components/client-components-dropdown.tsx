import React, { useEffect, useMemo, useState } from 'react'

type Control = { id: string; short?: string; long?: string; category?: string }
type Category = { id: string; label: string; items: Control[] }

type Faq = { id: string; question?: string; answer?: string; category?: string }
type FaqCategory = { id: string; label: string; items: Faq[] }

interface AppProps {
  // Optional override support (kept, but endpoints are now the default source)
  data?: Category[]
  fetchUrl?: string
}

function App({ data: initialData, fetchUrl }: AppProps) {
  const [categories, setCategories] = useState<Category[]>(initialData ?? [])
  const [expandedCategoryId, setExpande dCategoryId] = useState<string | null>(null)
  const [expandedControlItemId, setExpandedControlItemId] = useState<string | null>(null)

  const [faqCategories, setFaqCategories] = useState<FaqCategory[]>([])
  const [expandedFaqItemId, setExpandedFaqItemId] = useState<string | null>(null)

  const [loadingControls, setLoadingControls] = useState(false)
  const [loadingFaqs, setLoadingFaqs] = useState(false)
  const [errorControls, setErrorControls] = useState<string | null>(null)
  const [errorFaqs, setErrorFaqs] = useState<string | null>(null)

  const parseControlsFromRows = (rows: any[]): Category[] => {
    const byCategory = new Map<string, Control[]>()

    for (const row of rows ?? []) {
      if (!row) continue
      const categoryLabel = row.category ?? 'Uncategorized'
      const itemsForCategory = byCategory.get(categoryLabel) ?? []
      itemsForCategory.push({
        id: row.id,
        short: row.short,
        long: row.long,
        category: categoryLabel,
      })
      byCategory.set(categoryLabel, itemsForCategory)
    }

    // stable ordering (nice UX)
    const sorted = Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b))

    return sorted.map(([categoryLabel, items], index) => ({
      id: `${categoryLabel.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      label: categoryLabel,
      items,
    }))
  }

  const parseFaqsFromRows = (rows: any[]): FaqCategory[] => {
    const byCategory = new Map<string, Faq[]>()

    for (const row of rows ?? []) {
      if (!row) continue
      const categoryLabel = row.category ?? row.section ?? 'General'
      const itemsForCategory = byCategory.get(categoryLabel) ?? []
      itemsForCategory.push({
        id: row.id ?? `${categoryLabel}-${itemsForCategory.length}`,
        question: row.question,
        answer: row.answer,
        category: categoryLabel,
      })
      byCategory.set(categoryLabel, itemsForCategory)
    }

    const sorted = Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b))

    return sorted.map(([label, items], index) => ({
      id: `${label.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      label,
      items,
    }))
  }

  useEffect(() => {
    if (initialData) setCategories(initialData)
  }, [initialData])

  // Controls: fetch from API by default
  useEffect(() => {
    if (initialData) return

    const controlsEndpoint = fetchUrl ?? 'http://localhost:3000/api/trustControls'
    const controller = new AbortController()

    setLoadingControls(true)
    setErrorControls(null)

    fetch(controlsEndpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Controls request failed: ${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((rows) => {
        setCategories(parseControlsFromRows(rows))
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        console.error('controls fetch error', err)
        setErrorControls(err instanceof Error ? err.message : 'Failed to load trust controls')
      })
      .finally(() => setLoadingControls(false))

    return () => controller.abort()
  }, [initialData, fetchUrl])

  // FAQs: fetch from API
  useEffect(() => {
    const faqsEndpoint = 'http://localhost:3000/api/trustFaqs'
    const controller = new AbortController()

    setLoadingFaqs(true)
    setErrorFaqs(null)

    fetch(faqsEndpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`FAQs request failed: ${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((rows) => {
        setFaqCategories(parseFaqsFromRows(rows))
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        console.error('faqs fetch error', err)
        setErrorFaqs(err instanceof Error ? err.message : 'Failed to load FAQs')
      })
      .finally(() => setLoadingFaqs(false))

    return () => controller.abort()
  }, [])

  const toggleCategory = (categoryId: string) =>
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId))

  const toggleItem = (itemId: string) =>
    setExpandedControlItemId((prev) => (prev === itemId ? null : itemId))

  const toggleFaqItem = (itemId: string) =>
    setExpandedFaqItemId((prev) => (prev === itemId ? null : itemId))

  const flatFaqItems = useMemo(() => {
    return faqCategories.flatMap((category) =>
      category.items.map((item) => ({ ...item, category: category.label })),
    )
  }, [faqCategories])

  return (
    <div id="root">
      <h1>Trust Controls & FAQs</h1>

      <div className="two-column">
        <section className="column controls-column" aria-label="Trust controls">
          <h2>Trust Controls</h2>

          {loadingControls && <p>Loading trust controls…</p>}
          {errorControls && <p role="alert">Error loading trust controls: {errorControls}</p>}

          {!loadingControls && !errorControls && (
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
          )}
        </section>

        <section className="column faqs-column" aria-label="Frequently asked questions">
          <h2>Frequently Asked Questions</h2>

          {loadingFaqs && <p>Loading FAQs…</p>}
          {errorFaqs && <p role="alert">Error loading FAQs: {errorFaqs}</p>}

          {!loadingFaqs && !errorFaqs && (
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
                    <div className="item-answer">{faqItem.answer ?? 'No answer available'}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default App