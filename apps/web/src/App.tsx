import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './app/Home'
import Board from './app/Board'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board/:boardId" element={<Board />} />
      </Routes>
    </BrowserRouter>
  )
}
