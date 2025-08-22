import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [nickname, setNickname] = useState(
    () => localStorage.getItem('nickname') || ''
  )
  const navigate = useNavigate()

  const createBoard = () => {
    if (!nickname.trim()) return
    localStorage.setItem('nickname', nickname)
    const id = crypto.randomUUID()
    navigate(`/board/${id}`)
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
      <input
        className="w-full max-w-xs rounded border p-2"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      <button
        onClick={createBoard}
        className="rounded bg-blue-500 px-4 py-2 font-medium text-white"
      >
        Create board
      </button>
    </div>
  )
}
