import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'

// Mock Liveblocks client and react hooks
const { listeners, MockLiveObject, MockLiveList } = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const trigger = () => listeners.forEach((l) => l())
  class MockLiveObject<T extends Record<string, unknown>> {
    private data: T
    constructor(initial: T) {
      this.data = { ...initial }
    }
    get<K extends keyof T>(key: K): T[K] {
      return this.data[key]
    }
    set<K extends keyof T>(key: K, value: T[K]) {
      this.data[key] = value
      trigger()
    }
  }
  class MockLiveList<T> {
    private items: T[]
    constructor(initial: T[] = []) {
      this.items = initial
    }
    get length() {
      return this.items.length
    }
    push(item: T) {
      this.items.push(item)
      trigger()
    }
    get(index: number) {
      return this.items[index]
    }
  }
  return { listeners, MockLiveObject, MockLiveList }
})

vi.mock('@liveblocks/client', () => ({
  LiveObject: MockLiveObject,
  LiveList: MockLiveList,
}))

vi.mock('@liveblocks/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React: typeof import('react') = require('react')
  const store = { columns: new MockLiveList() }
  return {
    LiveblocksProvider: ({ children }: { children: React.ReactNode }) => children,
    RoomProvider: ({
      initialStorage,
      children,
    }: {
      initialStorage?: { columns: InstanceType<typeof MockLiveList> }
      children: React.ReactNode
    }) => {
      if (initialStorage) {
        store.columns = initialStorage.columns
      }
      return children
    },
    useStorage: (selector: (root: typeof store) => unknown) => {
      const [, force] = React.useReducer((x: number) => x + 1, 0)
      React.useEffect(() => {
        const l = () => force()
        listeners.add(l)
        return () => listeners.delete(l)
      }, [])
      return selector(store)
    },
    useRoom: () => ({
      subscribe: (_target: unknown, cb: () => void) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
    }),
    useMyPresence: () => [null, () => {}],
    useOthers: () => [],
  }
})

// Mock supabase client
vi.mock('../lib/supabase', () => {
  const upsert = vi.fn().mockResolvedValue({})
  const single = vi.fn().mockResolvedValue({ data: null })
  const eq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq }))
  return {
    supabase: { from: vi.fn(() => ({ select, upsert })) },
  }
})

import Board from './Board'

describe('Board', () => {
  it('allows adding columns and notes', async () => {
    render(
      <MemoryRouter initialEntries={['/board/123']}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    )

    // Add a column
    fireEvent.click(screen.getByText('+ Column'))
    await screen.findByDisplayValue('Column')

    // Add a note inside the column
    fireEvent.click(screen.getByText('+ Note'))
    // Expect two textboxes: column title input and note textarea
    expect(screen.getAllByRole('textbox')).toHaveLength(2)

    // Presence text
    expect(screen.getByText(/online: just you/i)).toBeInTheDocument()
  })
})

