import { LiveList, LiveObject } from '@liveblocks/client'
import {
  LiveblocksProvider,
  RoomProvider,
  useMyPresence,
  useOthers,
  useRoom,
  useStorage,
} from '@liveblocks/react'
import { useEffect, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Note = LiveObject<{ id: string; text: string }>
type Column = LiveObject<{ id: string; title: string; notes: LiveList<Note> }>

function BoardContent({ boardId }: { boardId: string }) {
  const columns = useStorage<LiveList<Column> | undefined>(
    (root) => (root as { columns?: LiveList<Column> }).columns
  )
  const room = useRoom()
  const [, updateMyPresence] = useMyPresence()
  const others = useOthers()

  useEffect(() => {
    updateMyPresence({ nickname: localStorage.getItem('nickname') || 'Anon' })
  }, [updateMyPresence])

  useEffect(() => {
    if (!columns) return
    ;(async () => {
      const { data, error } = await supabase
        .from('boards')
        .select('data')
        .eq('id', boardId)
        .maybeSingle()
      if (error) {
        console.warn('Failed to load board', error.message)
        return
      }
      if (data?.data && columns.length === 0) {
        const cols = data.data as {
          id: string
          title: string
          notes: { id: string; text: string }[]
        }[]
        for (const col of cols) {
          columns.push(
            new LiveObject({
              id: col.id,
              title: col.title,
              notes: new LiveList(
                col.notes.map((n) => new LiveObject(n))
              ),
            })
          )
        }
      }
    })()
  }, [boardId, columns])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    room.getStorage().then(({ root }) => {
      const cols = root.get('columns') as LiveList<Column>
      unsubscribe = room.subscribe(
        cols,
        () => {
          const serial: {
            id: string
            title: string
            notes: { id: string; text: string }[]
          }[] = []
          for (let i = 0; i < cols.length; i++) {
            const col = cols.get(i)!
            const notes = col.get('notes')
            const notesArr: { id: string; text: string }[] = []
            for (let j = 0; j < notes.length; j++) {
              const note = notes.get(j)!
              notesArr.push({ id: note.get('id'), text: note.get('text') })
            }
            serial.push({
              id: col.get('id'),
              title: col.get('title'),
              notes: notesArr,
            })
          }
          supabase.from('boards').upsert({ id: boardId, data: serial })
        },
        { isDeep: true }
      )
    })
    return () => unsubscribe?.()
  }, [room, boardId])

  const addColumn = () => {
    if (!columns) return
    columns.push(
      new LiveObject({
        id: crypto.randomUUID(),
        title: 'Column',
        notes: new LiveList<Note>([]),
      })
    )
  }

  const addNote = (column: Column) => {
    column.get('notes').push(
      new LiveObject({ id: crypto.randomUUID(), text: '' })
    )
  }

  if (!columns) return null

  return (
    <div className="space-y-4 p-4">
      <div>
        <button
          className="text-sm underline"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
        >
          Copy share link
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: columns.length }).map((_, i) => {
          const column = columns.get(i)!
          const notes = column.get('notes')
          return (
            <div
              key={column.get('id')}
              className="flex w-64 flex-shrink-0 flex-col rounded bg-gray-100 p-2"
            >
                <input
                  className="mb-2 w-full rounded border p-1"
                  value={column.get('title')}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    column.set('title', e.target.value)
                  }
                />
              <div className="flex flex-1 flex-col gap-2">
                  {Array.from({ length: notes.length }).map((_, j) => {
                    const note = notes.get(j)!
                    return (
                      <textarea
                        key={note.get('id')}
                        className="w-full rounded bg-yellow-200 p-2"
                        value={note.get('text')}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                          note.set('text', e.target.value)
                        }
                      />
                    )
                  })}
              </div>
              <button
                onClick={() => addNote(column)}
                className="mt-2 rounded bg-blue-500 px-2 py-1 text-sm text-white"
              >
                + Note
              </button>
            </div>
          )
        })}
          <button
            onClick={addColumn}
            className="w-64 flex-shrink-0 rounded border-2 border-dashed p-2"
          >
            + Column
          </button>
      </div>
      <div className="text-sm">
        Online: {others.map((o) => o.presence.nickname).join(', ') || 'just you'}
      </div>
    </div>
  )
}

export default function Board() {
  const { boardId = '' } = useParams()
  return (
    <LiveblocksProvider
      publicApiKey={import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY as string}
    >
      <RoomProvider
        id={`retro-${boardId}`}
        initialPresence={{ nickname: '' }}
        initialStorage={{ columns: new LiveList<Column>([]) }}
      >
        <BoardContent boardId={boardId} />
      </RoomProvider>
    </LiveblocksProvider>
  )
}
