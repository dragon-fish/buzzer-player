import './style.css'
import { BuzzerPlayer } from './BuzzerPlayer'

const $root = document.getElementById('root') as HTMLElement
const baseURL = new URL(import.meta.env.BASE_URL, window.location.href)
const musicList = [
  {
    label: 'Twinkle, Twinkle, Little Star',
    url: './demos/Twinkle, Twinkle, Little Star.bzs',
  },
  {
    label: 'Happy Birthday',
    url: './demos/Happy Birthday.bzs',
  },
  {
    label: 'Beethoven – Symphony No. 5 in C minor, Op. 67',
    url: './demos/Beethoven – Symphony No. 5 in C minor, Op. 67.bzs',
  },
  {
    label: 'Pachelbel – Canon in D',
    url: './demos/Pachelbel – Canon in D.bzs',
  },
]

const buzzer = new BuzzerPlayer({
  tempo: 120,
  waveform: 'sine',
  volume: 0.5,
})

const MusicSelector = ({
  list,
  onChange,
  ...props
}: {
  list: { label: string; url: string }[]
  onChange: (url: string) => void
}) => {
  return (
    <select
      onChange={(e) => {
        const selected = list.find(
          (item) => item.label === (e.target as HTMLSelectElement).value
        )
        if (selected) {
          onChange(selected.url)
        }
      }}
      {...props}
    >
      {list.map((item) => (
        <option key={item.label} value={item.label}>
          {item.label}
        </option>
      ))}
    </select>
  )
}

const App = () => {
  const $notesInput = (<textarea id="bzs"></textarea>) as HTMLInputElement
  const $musicSelector = (
    <MusicSelector
      style={{ width: '100%' }}
      list={musicList}
      onChange={(url) => {
        loadScript(url)
      }}
    />
  ) as HTMLSelectElement

  const loadScript = async (url: string) => {
    const response = await fetch(new URL(url, baseURL).href)
    if (!response.ok) {
      console.error('Failed to load script:', response.statusText)
      return
    }
    const text = await response.text()
    $notesInput.value = text
    buzzer.stop()
  }

  $musicSelector.value = musicList[0].label
  loadScript(musicList[0].url)

  return (
    <main>
      <h1>Buzzer Player</h1>
      <p>Lightweight WebAudio library for browser‑side “buzzer” melodies.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label htmlFor="bzs">Buzzer Script (.BZS)</label>
        {$musicSelector}
        {$notesInput}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '10px',
        }}
      >
        <button
          onClick={() => {
            buzzer.playScript($notesInput.value)
          }}
        >
          Play
        </button>
        <button
          onClick={() => {
            buzzer.stop()
          }}
        >
          Stop
        </button>
      </div>
    </main>
  )
}

$root.innerHTML = ''
$root.appendChild(<App />)
