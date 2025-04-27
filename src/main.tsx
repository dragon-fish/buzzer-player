import './style.css'
import { BuzzerPlayer } from './BuzzerPlayer'

const $root = document.getElementById('root') as HTMLElement

const buzzer = new BuzzerPlayer({
  tempo: 120,
  waveform: 'sine',
  volume: 0.5,
})

const App = () => {
  const $notesInput = (<textarea id="bzs"></textarea>) as HTMLInputElement

  fetch('/demos/Pachelbel – Canon in D.bzs')
    .then((res) => {
      return res.text()
    })
    .then((text) => {
      $notesInput.value = text
    })
    .catch((err) => {
      console.error('Failed to fetch default tones:', err)
    })

  return (
    <main>
      <h1>BazzerPlayer</h1>
      <p>Lightweight WebAudio library for browser‑side “buzzer” melodies.</p>
      <div>
        <label htmlFor="bzs">Bazzer Script (.BZS)</label>
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
