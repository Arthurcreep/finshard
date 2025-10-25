import { useState } from 'react'
import { apiPost } from '../lib/api'

export default function Admin() {
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [msg, setMsg] = useState('')

  async function createArticle(e){
    e.preventDefault()
    setMsg('...')
    try {
      const a = await apiPost('/api/articles', {
        title, locale:'ru', contentMd,
        status:'PUBLISHED', publishedAt: new Date().toISOString()
      })
      setMsg(`OK: создано /blog/${a.slug}`)
      setTitle(''); setContentMd('')
    } catch (e) {
      setMsg('Ошибка: ' + e.message)
    }
  }

  return (
    <div style={{ padding:16, maxWidth:780 }}>
      <h1>Админ-панель</h1>
      <form onSubmit={createArticle} style={{display:'grid', gap:12}}>
        <input placeholder="Заголовок" value={title} onChange={e=>setTitle(e.target.value)} required />
        <textarea placeholder="Markdown" rows={10} value={contentMd} onChange={e=>setContentMd(e.target.value)} required />
        <button type="submit">Опубликовать</button>
      </form>
      <div style={{marginTop:8, opacity:.8}}>{msg}</div>
    </div>
  )
}
