import './style.css'
import { BuzzerPlayer, BzsRuntimeError } from './BuzzerPlayer/BuzzerPlayer.js'
import { BzsProgram, BzsPitch } from './BuzzerPlayer/BzsParser.js'

const $root = document.getElementById('root') as HTMLElement
const baseURL = new URL(import.meta.env.BASE_URL, window.location.href)

// ===== Project Types =====
interface Project {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
  isDemo?: boolean
  demoUrl?: string
}

const STORAGE_KEY = 'buzzer-projects'
const CURRENT_PROJECT_KEY = 'buzzer-current-project'

// Simple nanoid implementation
const nanoid = (size = 12) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ===== Demo Music List =====
const demoList: Omit<Project, 'content' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'demo-twinkle',
    name: 'Twinkle, Twinkle, Little Star',
    isDemo: true,
    demoUrl: './demos/Twinkle, Twinkle, Little Star.bzs',
  },
  {
    id: 'demo-twinkle-hyper',
    name: 'Twinkle, Twinkle, Hyper Star',
    isDemo: true,
    demoUrl: './demos/Twinkle, Twinkle, Hyper Star.bzs',
  },
  {
    id: 'demo-birthday',
    name: 'Happy Birthday',
    isDemo: true,
    demoUrl: './demos/Happy Birthday.bzs',
  },
  {
    id: 'demo-beethoven',
    name: 'Beethoven – Symphony No. 5',
    isDemo: true,
    demoUrl: './demos/Beethoven – Symphony No. 5 in C minor, Op. 67.bzs',
  },
  {
    id: 'demo-tetris',
    name: 'Tetris Theme A',
    isDemo: true,
    demoUrl: './demos/Hirokazu Tanaka - Tetris Theme A.bzs',
  },
  {
    id: 'demo-canon',
    name: 'Pachelbel – Canon in D',
    isDemo: true,
    demoUrl: './demos/Pachelbel – Canon in D.bzs',
  },
  {
    id: 'demo-debug',
    name: 'Debug Song (AI)',
    isDemo: true,
    demoUrl: './demos/debug.bzs',
  },
]

// ===== Storage Functions =====
const loadProjects = (): Project[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const saveProjects = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

const loadCurrentProjectId = (): string | null => {
  return localStorage.getItem(CURRENT_PROJECT_KEY)
}

const saveCurrentProjectId = (id: string) => {
  localStorage.setItem(CURRENT_PROJECT_KEY, id)
}

const createProject = (name: string, content = ''): Project => {
  const now = Date.now()
  return {
    id: nanoid(),
    name,
    content,
    createdAt: now,
    updatedAt: now,
  }
}

const updateProject = (projects: Project[], id: string, updates: Partial<Project>): Project[] => {
  return projects.map((p) =>
    p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
  )
}

const deleteProject = (projects: Project[], id: string): Project[] => {
  return projects.filter((p) => p.id !== id)
}

// ===== Buzzer Player Instance =====
const buzzer = new BuzzerPlayer({
  tempo: 120,
  defaultWaveform: 'sine',
  masterVolume: 0.5,
})
;(window as any).buzzer = buzzer

const formatPitch = (p: BzsPitch) => `${p.note}${p.accidental ?? ''}${p.octave}`

// ===== Icon Components =====
const Icons = {
  play: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>,
  pause: () => <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  stop: () => <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>,
  plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  copy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  music: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M8 17V5l13-2v12"/></svg>,
  folder: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  lock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
}

// ===== App Component =====
const App = () => {
  // State tracking
  let lastPlayState: string | null = null
  let projects: Project[] = loadProjects()
  let currentProjectId: string | null = loadCurrentProjectId()
  let demoCache: Map<string, string> = new Map()
  
  // Define closeSettings early for use in event handlers
  const closeSettings = () => {
    $settingsDialog.style.display = 'none'
  }

  // Elements
  const $notesInput = (
    <textarea
      id="bzs"
      spellCheck={false}
      onInput={(e) => {
        buzzer.stop()
        const content = (e.target as HTMLTextAreaElement).value
        handleScriptChange(content)
        
        // Auto-save for non-demo projects
        if (currentProjectId && !currentProjectId.startsWith('demo-')) {
          const proj = projects.find(p => p.id === currentProjectId)
          if (proj) {
            proj.content = content
            proj.updatedAt = Date.now()
            saveProjects(projects)
          }
        }
      }}
    ></textarea>
  ) as HTMLTextAreaElement

  const $projectList = (<div className="project-list"></div>) as HTMLDivElement
  const $astView = (
    <div className="ast-view">No script parsed yet.</div>
  ) as HTMLDivElement
  const $notesView = (
    <div className="notes-view">No notes yet.</div>
  ) as HTMLDivElement
  const $settingsDialog = (
    <div 
      className="settings-dialog" 
      style={{ display: 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeSettings()
        }
      }}
    ></div>
  ) as HTMLDivElement
  const $progressFill = (
    <div className="progress-fill"></div>
  ) as HTMLDivElement
  const $progressBar = (
    <div
      className="progress-bar"
      onClick={(e) => handleProgressClick(e as MouseEvent)}
    >
      {$progressFill}
    </div>
  ) as HTMLDivElement
  const $currentTime = (<span className="time-current">0:00</span>) as HTMLSpanElement
  const $durationTime = (<span className="time-duration">0:00</span>) as HTMLSpanElement
  const $projectTitle = (<span className="project-title">Untitled</span>) as HTMLSpanElement

  const debounce = <T extends (...args: any[]) => any>(fn: T, ms: number) => {
    let timeoutId: any
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => fn.apply(null, args), ms)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ===== Project Management =====
  const renderProjectList = () => {
    $projectList.innerHTML = ''
    
    // Demo section
    const $demoSection = (
      <div className="project-section">
        <div className="section-header">
          <Icons.lock />
          <span>示例乐谱 (只读)</span>
        </div>
      </div>
    ) as HTMLDivElement

    demoList.forEach((demo) => {
      const isActive = currentProjectId === demo.id
      const $item = (
        <div
          className={`project-item ${isActive ? 'active' : ''} demo`}
          onClick={() => selectProject(demo.id)}
        >
          <div className="project-item-info">
            <Icons.music />
            <span className="project-name">{demo.name}</span>
          </div>
          <div className="project-item-actions">
            <button
              className="icon-btn"
              title="复制为新工程"
              onClick={(e) => {
                e.stopPropagation()
                copyFromDemo(demo.id)
              }}
            >
              <Icons.copy />
            </button>
          </div>
        </div>
      ) as HTMLDivElement
      $demoSection.appendChild($item)
    })
    $projectList.appendChild($demoSection)

    // User projects section
    const $userSection = (
      <div className="project-section">
        <div className="section-header">
          <Icons.folder />
          <span>我的工程</span>
          <button className="icon-btn add-btn" title="新建工程" onClick={createNewProject}>
            <Icons.plus />
          </button>
        </div>
      </div>
    ) as HTMLDivElement

    if (projects.length === 0) {
      const $empty = (
        <div className="empty-hint">
          暂无工程，点击 + 新建
        </div>
      ) as HTMLDivElement
      $userSection.appendChild($empty)
    } else {
      // Sort by updated time (most recent first)
      const sortedProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
      sortedProjects.forEach((proj) => {
        const isActive = currentProjectId === proj.id
        const $item = (
          <div
            className={`project-item ${isActive ? 'active' : ''}`}
            onClick={() => selectProject(proj.id)}
          >
            <div className="project-item-info">
              <Icons.music />
              <span className="project-name">{proj.name}</span>
            </div>
            <div className="project-item-actions">
              <button
                className="icon-btn"
                title="重命名"
                onClick={(e) => {
                  e.stopPropagation()
                  renameProject(proj.id)
                }}
              >
                <Icons.edit />
              </button>
              <button
                className="icon-btn"
                title="复制"
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateProject(proj.id)
                }}
              >
                <Icons.copy />
              </button>
              <button
                className="icon-btn"
                title="导出"
                onClick={(e) => {
                  e.stopPropagation()
                  exportProject(proj.id)
                }}
              >
                <Icons.download />
              </button>
              <button
                className="icon-btn danger"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteProjectById(proj.id)
                }}
              >
                <Icons.trash />
              </button>
            </div>
          </div>
        ) as HTMLDivElement
        $userSection.appendChild($item)
      })
    }
    $projectList.appendChild($userSection)
  }

  const selectProject = async (id: string) => {
    currentProjectId = id
    saveCurrentProjectId(id)

    // Check if it's a demo
    const demo = demoList.find((d) => d.id === id)
    if (demo && demo.demoUrl) {
      // Load demo content
      let content = demoCache.get(id)
      if (!content) {
        const response = await fetch(new URL(demo.demoUrl, baseURL).href)
        if (response.ok) {
          content = await response.text()
          demoCache.set(id, content)
        } else {
          content = '// Failed to load demo'
        }
      }
      $notesInput.value = content
      $notesInput.readOnly = true
      $projectTitle.textContent = `${demo.name} (只读)`
    } else {
      // Load user project
      const proj = projects.find((p) => p.id === id)
      if (proj) {
        $notesInput.value = proj.content
        $notesInput.readOnly = false
        $projectTitle.textContent = proj.name
      }
    }

    renderProjectList()
    buzzer.stop()
    handleScriptChange($notesInput.value)
    updateUI()
  }

  const createNewProject = () => {
    const name = prompt('请输入工程名称:', '新工程')
    if (!name) return

    const proj = createProject(name, getDefaultScript())
    projects.push(proj)
    saveProjects(projects)
    selectProject(proj.id)
  }

  const getDefaultScript = () => {
    return `// 新工程
// BZS v0.3 脚本

@tempo 120
@master_volume 0.5
@waveform sine

track melody:
  C4/4 D4/4 E4/4 F4/4 | G4/2 G4/2 |
`
  }

  const copyFromDemo = async (demoId: string) => {
    const demo = demoList.find((d) => d.id === demoId)
    if (!demo || !demo.demoUrl) return

    let content = demoCache.get(demoId)
    if (!content) {
      const response = await fetch(new URL(demo.demoUrl, baseURL).href)
      if (response.ok) {
        content = await response.text()
        demoCache.set(demoId, content)
      } else {
        content = '// Failed to load demo'
      }
    }

    const name = prompt('请输入新工程名称:', `${demo.name} (副本)`)
    if (!name) return

    const proj = createProject(name, content)
    projects.push(proj)
    saveProjects(projects)
    selectProject(proj.id)
  }

  const duplicateProject = (id: string) => {
    const proj = projects.find((p) => p.id === id)
    if (!proj) return

    const name = prompt('请输入新工程名称:', `${proj.name} (副本)`)
    if (!name) return

    const newProj = createProject(name, proj.content)
    projects.push(newProj)
    saveProjects(projects)
    selectProject(newProj.id)
  }

  const renameProject = (id: string) => {
    const proj = projects.find((p) => p.id === id)
    if (!proj) return

    const name = prompt('请输入新名称:', proj.name)
    if (!name || name === proj.name) return

    projects = updateProject(projects, id, { name })
    saveProjects(projects)
    
    if (currentProjectId === id) {
      $projectTitle.textContent = name
    }
    renderProjectList()
  }

  const deleteProjectById = (id: string) => {
    const proj = projects.find((p) => p.id === id)
    if (!proj) return

    if (!confirm(`确定要删除工程 "${proj.name}" 吗？`)) return

    projects = deleteProject(projects, id)
    saveProjects(projects)

    // If deleted current project, select first available
    if (currentProjectId === id) {
      if (projects.length > 0) {
        selectProject(projects[0].id)
      } else {
        selectProject(demoList[0].id)
      }
    } else {
      renderProjectList()
    }
  }

  const exportProject = (id: string) => {
    const proj = projects.find((p) => p.id === id)
    if (!proj) return

    const blob = new Blob([proj.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${proj.name}.bzs`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importProject = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.bzs,.txt'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const content = await file.text()
      const baseName = file.name.replace(/\.(bzs|txt)$/i, '')
      const name = prompt('请输入工程名称:', baseName) || baseName

      const proj = createProject(name, content)
      projects.push(proj)
      saveProjects(projects)
      selectProject(proj.id)
    }
    input.click()
  }

  const showSettings = () => {
    $settingsDialog.innerHTML = ''
    const currentVolume = buzzer.options.masterVolume
    const currentTempo = buzzer.options.tempo

    const $content = (
      <div className="settings-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>设置</h3>
          <button className="close-btn" onClick={closeSettings}>×</button>
        </div>
        <div className="settings-body">
          <div className="setting-item">
            <label>
              主音量
              <span className="setting-value" id="volume-value">{(currentVolume * 100).toFixed(0)}%</span>
            </label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={currentVolume * 100}
              onInput={(e) => {
                const val = Number((e.target as HTMLInputElement).value) / 100
                buzzer.options.masterVolume = val
                const $volumeValue = document.getElementById('volume-value')
                if ($volumeValue) $volumeValue.textContent = `${(val * 100).toFixed(0)}%`
              }}
            />
          </div>
          <div className="setting-item">
            <label>
              默认 BPM
              <span className="setting-value" id="tempo-value">{currentTempo}</span>
            </label>
            <input 
              type="range" 
              min="40" 
              max="240" 
              value={currentTempo}
              onInput={(e) => {
                const val = Number((e.target as HTMLInputElement).value)
                buzzer.options.tempo = val
                const $tempoValue = document.getElementById('tempo-value')
                if ($tempoValue) $tempoValue.textContent = String(val)
              }}
            />
          </div>
          <div className="setting-item">
            <label>默认波形</label>
            <select 
              value={String(buzzer.options.defaultWaveform)}
              onChange={(e) => {
                buzzer.options.defaultWaveform = (e.target as HTMLSelectElement).value
              }}
            >
              <option value="sine">正弦波 (Sine)</option>
              <option value="triangle">三角波 (Triangle)</option>
              <option value="sawtooth">锯齿波 (Sawtooth)</option>
              <option value="pulse">方波 (Pulse)</option>
            </select>
          </div>
          <div className="setting-item">
            <label>关于</label>
            <div className="about-info">
              <p>Buzzer Player v0.3</p>
              <p>基于 WebAudio API 的浏览器乐谱播放器</p>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">
                轻量级的浏览器端"蜂鸣器"旋律播放库
              </p>
              <a href="https://github.com/dragon-fish/buzzer-player" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                在 GitHub 上查看项目
              </a>
            </div>
          </div>
        </div>
      </div>
    ) as HTMLDivElement

    $settingsDialog.appendChild($content)
    $settingsDialog.style.display = 'flex'
  }

  // ===== Player Controls =====
  const handleProgressClick = async (e: MouseEvent) => {
    const rect = $progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, clickX / rect.width))
    const newTime = percentage * buzzer.duration

    if (buzzer.state === 'stopped') {
      const script = $notesInput.value
      if (!script.trim()) return

      try {
        const playPromise = buzzer.playScript(script, newTime)

        const updateWhenReady = () => {
          if (buzzer.program) {
            updateAST(buzzer.program)
            updateNotesView()
            updateUI()
          } else if (buzzer.state === 'preparing') {
            setTimeout(updateWhenReady, 50)
          }
        }
        updateWhenReady()

        await playPromise
      } catch (err) {
        console.error('Error playing from position:', err)
        if (err instanceof BzsRuntimeError) {
          showErrors(err.errors)
        }
      }
    } else {
      await buzzer.seek(newTime)
      updateUI()
    }
  }

  const showErrors = (errors: any[]) => {
    const lines = errors
      .slice(0, 10)
      .map((x) =>
        x.line != null && x.column != null
          ? `Line ${x.line}, Col ${x.column}: ${x.message}`
          : x.message
      )
      .join('\n')
    $astView.innerHTML = `<div style="color: #ff5555; padding: 10px; white-space: pre-wrap;">ParserError:\n${lines}</div>`
  }

  const handleScriptChange = debounce(async (text: string) => {
    try {
      const program = await buzzer.load(text)
      updateAST(program)
      updateNotesView()
      updateUI()
      if (program.errors?.length) {
        showErrors(program.errors)
      }
    } catch (e) {
      if (e instanceof BzsRuntimeError) {
        showErrors(e.errors)
      }
    }
  }, 300)

  const updateAST = (program: BzsProgram | null) => {
    if (!program) {
      $astView.textContent = 'No script parsed yet.'
      return
    }
    const cleanProgram = {
      directives: program.directives,
      tracks: program.tracks.map((t) => ({
        name: t.name,
        params: t.params,
        items: t.items
          .slice(0, 5)
          .concat(
            t.items.length > 5
              ? ([`... ${t.items.length - 5} more items`] as any)
              : []
          ),
      })),
      patterns: Object.keys(program.patterns),
    }
    $astView.textContent = JSON.stringify(cleanProgram, null, 2)
  }

  const updateNotesView = () => {
    const timeline = buzzer.timeline
    if (!timeline.length) {
      $notesView.innerHTML =
        '<div style="padding: 10px; color: #888;">No notes scheduled.</div>'
      return
    }

    $notesView.innerHTML = ''
    timeline.forEach((ev, idx) => {
      let label = ''
      if (ev.kind === 'tone') {
        label = ev.pitch ? formatPitch(ev.pitch) : '?'
      } else if (ev.kind === 'chord') {
        label = (ev.pitches ?? []).map(formatPitch).join('+')
      } else {
        label = '-'
      }

      const $item = (
        <div
          className={`note-item ${ev.kind === 'rest' ? 'rest' : ''}`}
          data-idx={idx}
          data-start={ev.startSec}
          data-end={ev.endSec}
        >
          <span className="note-label">{label}</span>
          <span className="note-time">{ev.startSec.toFixed(2)}s</span>
        </div>
      ) as HTMLDivElement
      $notesView.appendChild($item)
    })
  }

  const updateUI = () => {
    const current = buzzer.currentTime
    const duration = buzzer.duration
    const progress = duration > 0 ? (current / duration) * 100 : 0

    $progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`
    $currentTime.textContent = formatTime(Math.max(0, current))
    $durationTime.textContent = formatTime(duration)

    const state = buzzer.state
    const isPlaying = state === 'playing' || state === 'preparing'
    const newPlayState = isPlaying ? 'playing' : 'stopped'

    if (newPlayState !== lastPlayState) {
      lastPlayState = newPlayState
      if (isPlaying) {
        $playPauseBtn.classList.add('playing')
        $playPauseBtn.innerHTML = ''
        $playPauseBtn.appendChild(<Icons.pause />)
      } else {
        $playPauseBtn.classList.remove('playing')
        $playPauseBtn.innerHTML = ''
        $playPauseBtn.appendChild(<Icons.play />)
      }
    }

    const children = $notesView.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLDivElement
      const start = parseFloat(child.dataset.start || '0')
      const end = parseFloat(child.dataset.end || '0')

      if (current >= start && current < end) {
        if (!child.classList.contains('active')) {
          child.classList.add('active')
          child.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      } else {
        child.classList.remove('active')
      }
    }

    if (
      buzzer.state === 'playing' ||
      buzzer.state === 'paused' ||
      buzzer.state === 'preparing'
    ) {
      requestAnimationFrame(updateUI)
    } else {
      if (progress >= 99) {
        $progressFill.style.width = '100%'
      }
    }
  }

  const handlePlay = async () => {
    try {
      const script = $notesInput.value
      if (!script.trim()) return

      await buzzer.stop()

      const playPromise = buzzer.playScript(script)

      const updateWhenReady = () => {
        if (buzzer.program) {
          updateAST(buzzer.program)
          updateNotesView()
          updateUI()
        } else if (buzzer.state === 'preparing') {
          setTimeout(updateWhenReady, 50)
        }
      }
      updateWhenReady()

      await playPromise
    } catch (e) {
      console.error('Error playing script:', e)
      if (e instanceof BzsRuntimeError) {
        showErrors(e.errors)
      } else {
        alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const handleTogglePlay = () => {
    const state = buzzer.state
    if (state === 'playing' || state === 'preparing') {
      buzzer.pause()
    } else if (state === 'paused') {
      buzzer.resume()
    } else {
      handlePlay()
    }
  }

  const $playPauseBtn = (
    <button className="play-btn" onClick={handleTogglePlay}>
      <Icons.play />
    </button>
  ) as HTMLButtonElement

  const $stopBtn = (
    <button className="stop-btn" onClick={() => buzzer.stop()}>
      <Icons.stop />
    </button>
  ) as HTMLButtonElement

  // Initial setup
  renderProjectList()

  // Load initial project
  if (currentProjectId) {
    selectProject(currentProjectId)
  } else if (projects.length > 0) {
    selectProject(projects[0].id)
  } else {
    selectProject(demoList[0].id)
  }

  return (
    <div className="app-container">
      <header>
        <h1>Buzzer Player v0.3</h1>
        <div className="header-project-info">
          {$projectTitle}
        </div>
        <div className="header-actions">
          <button 
            className="header-btn" 
            title="导出当前工程"
            onClick={() => {
              if (currentProjectId) {
                if (currentProjectId.startsWith('demo-')) {
                  const demo = demoList.find(d => d.id === currentProjectId)
                  if (demo) {
                    const blob = new Blob([$notesInput.value], { type: 'text/plain;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${demo.name}.bzs`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }
                } else {
                  exportProject(currentProjectId)
                }
              }
            }}
          >
            <Icons.download />
            <span>导出</span>
          </button>
          <button 
            className="header-btn" 
            title="设置"
            onClick={showSettings}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24"/>
            </svg>
          </button>
          <button 
            className="header-btn" 
            title="GitHub 仓库"
            onClick={() => {
              window.open('https://github.com/dragon-fish/buzzer-player', '_blank')
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>GitHub</span>
          </button>
        </div>
      </header>

      <div className="sidebar">
        <div className="sidebar-toolbar">
          <button className="toolbar-btn" onClick={createNewProject} title="新建工程">
            <Icons.plus />
            <span>新建</span>
          </button>
          <button className="toolbar-btn" onClick={importProject} title="导入工程">
            <Icons.upload />
            <span>导入</span>
          </button>
        </div>
        {$projectList}
        <div className="sidebar-footer">
          <a 
            href="https://github.com/dragon-fish/buzzer-player" 
            target="_blank" 
            rel="noopener noreferrer"
            className="github-link"
            title="在 GitHub 上查看项目"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>dragon-fish/buzzer-player</span>
          </a>
        </div>
      </div>

      <main className="main-content">
        <div className="editor-container">{$notesInput}</div>
        <div className="visualizer-container">
          <div className="section-title">Notes Timeline</div>
          {$notesView}
        </div>
      </main>

      <div className="right-panel">
        <div className="section-title" style={{ padding: '15px 15px 0' }}>
          Parsed AST
        </div>
        {$astView}
      </div>

      <footer className="player-bar">
        <div className="player-controls">
          <div className="control-buttons">
            {$playPauseBtn}
            {$stopBtn}
          </div>
          <div className="timeline-wrapper">
            {$currentTime}
            {$progressBar}
            {$durationTime}
          </div>
        </div>
      </footer>

      {$settingsDialog}
    </div>
  )
}

$root.innerHTML = ''
$root.appendChild(<App />)
