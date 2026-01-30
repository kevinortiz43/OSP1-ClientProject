import React from 'react'
import './App.css'
import AppComponent from './components/Appc'
import allTrustControls from '../server/data/allTrustControls.json'
import allTrustFaqs from '../server/data/allTrustFaqs.json'


  {<div className="searchbar">
   <input type="text" id="s" placeholder="Search for keywords and filter info from the FAQ and Trust Control..."></input>
  </div>}

export default function App() {
  return <AppComponent />
}