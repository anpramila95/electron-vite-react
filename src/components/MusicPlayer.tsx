import React, { useState, useEffect } from 'react'

interface LocalTrack {
  id: string
  name: string
  url: string
  path?: string
}

export function MusicPlayer({
  isOpen,
  onClose,
  streamKey,
}: {
  isOpen: boolean
  onClose: () => void
  streamKey: string
}) {
  const [sourceType, setSourceType] = useState<'youtube' | 'mp3' | 'local'>('youtube')

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [currentYoutubeId, setCurrentYoutubeId] = useState('')

  // MP3 Link state
  const [mp3Url, setMp3Url] = useState('')
  const [currentMp3Url, setCurrentMp3Url] = useState('')

  // Local tracks state
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([])
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)

  // Playback & volume
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(70)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoop, setIsLoop] = useState(true)

  // Load state from backend / localStorage
  useEffect(() => {
    if (!streamKey || !window.ipcRenderer) return

    window.ipcRenderer.invoke('music:get-state', streamKey).then((saved) => {
      if (saved) {
        if (saved.sourceType) setSourceType(saved.sourceType)
        if (saved.youtubeUrl) setYoutubeUrl(saved.youtubeUrl)
        if (saved.youtubeId) setCurrentYoutubeId(saved.youtubeId)
        if (saved.mp3Url) {
          setMp3Url(saved.mp3Url)
          setCurrentMp3Url(saved.mp3Url)
        }
        if (Array.isArray(saved.playlist)) setLocalTracks(saved.playlist)
        if (typeof saved.currentTrackIndex === 'number') setCurrentTrackIndex(saved.currentTrackIndex)
        if (typeof saved.isPlaying === 'boolean') setIsPlaying(saved.isPlaying)
        if (typeof saved.volume === 'number') setVolume(saved.volume)
        if (typeof saved.isLoop === 'boolean') setIsLoop(saved.isLoop)
      } else {
        // Fallback localStorage
        try {
          const sType = localStorage.getItem('music_source_type')
          const sYt = localStorage.getItem('music_yt_url')
          const sMp3 = localStorage.getItem('music_mp3_url')
          const sVol = localStorage.getItem('music_volume')
          if (sType === 'youtube' || sType === 'mp3' || sType === 'local') setSourceType(sType)
          if (sYt) {
            setYoutubeUrl(sYt)
            const id = extractYouTubeId(sYt)
            if (id) setCurrentYoutubeId(id)
          }
          if (sMp3) {
            setMp3Url(sMp3)
            setCurrentMp3Url(sMp3)
          }
          if (sVol) setVolume(Number(sVol) || 70)
        } catch {}
      }
    })

    const handleStateChange = (_: any, data: { streamKey: string; music: any }) => {
      if (data.streamKey === streamKey && data.music) {
        if (typeof data.music.currentTrackIndex === 'number') {
          setCurrentTrackIndex(data.music.currentTrackIndex)
        }
        if (typeof data.music.isPlaying === 'boolean') {
          setIsPlaying(data.music.isPlaying)
        }
      }
    }

    window.ipcRenderer.on('music:state-change', handleStateChange)
    return () => {
      window.ipcRenderer?.off('music:state-change', handleStateChange)
    }
  }, [streamKey])

  // Broadcast state to OBS Preview via IPC
  const syncToPreview = (overrides?: Record<string, any>) => {
    if (!window.ipcRenderer || !streamKey) return

    const currentUrl =
      sourceType === 'youtube'
        ? ''
        : sourceType === 'mp3'
        ? currentMp3Url
        : localTracks[currentTrackIndex]?.url || ''

    const payload = {
      sourceType,
      youtubeUrl,
      youtubeId: currentYoutubeId,
      mp3Url: currentMp3Url,
      url: currentUrl,
      title:
        sourceType === 'youtube'
          ? 'YouTube Live / Video'
          : sourceType === 'mp3'
          ? currentMp3Url
          : localTracks[currentTrackIndex]?.name || '',
      playlist: localTracks,
      currentTrackIndex,
      isPlaying,
      volume: isMuted ? 0 : volume,
      isLoop,
      ...overrides,
    }

    window.ipcRenderer.invoke('music:update', {
      streamKey,
      music: payload,
    })
  }

  // Extract YouTube ID
  function extractYouTubeId(url: string): string | null {
    if (!url) return null
    const clean = url.trim()
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = clean.match(regExp)
    if (match && match[2].length === 11) return match[2]
    const liveMatch = clean.match(/youtube\.com\/live\/([^#&?]*)/)
    if (liveMatch && liveMatch[1]) return liveMatch[1]
    return null
  }

  // Handle Play YouTube
  const handlePlayYoutube = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const id = extractYouTubeId(youtubeUrl)
    if (!id) {
      alert('Vui lòng nhập link YouTube hợp lệ (ví dụ: https://www.youtube.com/watch?v=...)')
      return
    }

    setCurrentYoutubeId(id)
    setIsPlaying(true)
    localStorage.setItem('music_yt_url', youtubeUrl)
    localStorage.setItem('music_source_type', 'youtube')

    syncToPreview({
      sourceType: 'youtube',
      youtubeId: id,
      youtubeUrl,
      isPlaying: true,
    })
  }

  // Handle Play MP3 URL
  const handlePlayMp3 = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!mp3Url.trim()) return

    const trimmed = mp3Url.trim()
    setCurrentMp3Url(trimmed)
    setIsPlaying(true)
    localStorage.setItem('music_mp3_url', trimmed)
    localStorage.setItem('music_source_type', 'mp3')

    syncToPreview({
      sourceType: 'mp3',
      mp3Url: trimmed,
      url: trimmed,
      isPlaying: true,
    })
  }

  // Pick Folder from Computer via Electron Dialog
  const handlePickFolder = async () => {
    if (!window.ipcRenderer) return
    const tracks: LocalTrack[] = await window.ipcRenderer.invoke('music:pick-folder')
    if (!tracks || tracks.length === 0) {
      alert('Không tìm thấy file nhạc hợp lệ (.mp3, .wav, .m4a, .ogg) trong thư mục này')
      return
    }

    setLocalTracks(tracks)
    setCurrentTrackIndex(0)
    setSourceType('local')
    setIsPlaying(true)
    localStorage.setItem('music_source_type', 'local')

    syncToPreview({
      sourceType: 'local',
      playlist: tracks,
      currentTrackIndex: 0,
      url: tracks[0].url,
      title: tracks[0].name,
      isPlaying: true,
    })
  }

  // Pick Files from Computer via Electron Dialog
  const handlePickFiles = async () => {
    if (!window.ipcRenderer) return
    const tracks: LocalTrack[] = await window.ipcRenderer.invoke('music:pick-files')
    if (!tracks || tracks.length === 0) return

    setLocalTracks(tracks)
    setCurrentTrackIndex(0)
    setSourceType('local')
    setIsPlaying(true)
    localStorage.setItem('music_source_type', 'local')

    syncToPreview({
      sourceType: 'local',
      playlist: tracks,
      currentTrackIndex: 0,
      url: tracks[0].url,
      title: tracks[0].name,
      isPlaying: true,
    })
  }

  const playLocalTrack = (index: number) => {
    if (!localTracks[index]) return
    setCurrentTrackIndex(index)
    setIsPlaying(true)

    syncToPreview({
      sourceType: 'local',
      currentTrackIndex: index,
      url: localTracks[index].url,
      title: localTracks[index].name,
      isPlaying: true,
    })
  }

  const handleNextTrack = () => {
    if (localTracks.length === 0) return
    const next = (currentTrackIndex + 1) % localTracks.length
    playLocalTrack(next)
  }

  const handlePrevTrack = () => {
    if (localTracks.length === 0) return
    const prev = (currentTrackIndex - 1 + localTracks.length) % localTracks.length
    playLocalTrack(prev)
  }

  const handleTogglePlay = () => {
    const nextPlay = !isPlaying
    setIsPlaying(nextPlay)
    syncToPreview({ isPlaying: nextPlay })
  }

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol)
    if (isMuted) setIsMuted(false)
    syncToPreview({ volume: newVol })
    localStorage.setItem('music_volume', String(newVol))
  }

  const handleToggleLoop = () => {
    const nextLoop = !isLoop
    setIsLoop(nextLoop)
    syncToPreview({ isLoop: nextLoop })
  }

  if (!isOpen) return null

  const currentPlayingTitle =
    sourceType === 'youtube'
      ? currentYoutubeId
        ? 'YouTube Livestream / Video'
        : 'Chưa nhập link YouTube'
      : sourceType === 'mp3'
      ? currentMp3Url
        ? currentMp3Url.split('/').pop() || 'Link MP3 Online'
        : 'Chưa nhập link MP3'
      : localTracks[currentTrackIndex]?.name || 'Chưa nạp bài hát từ máy'

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4'>
      <div className='flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60'>
          <div className='flex items-center gap-2.5'>
            <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 text-lg border border-indigo-500/30'>
              🎵
            </span>
            <div>
              <h2 className='text-sm font-bold text-white flex items-center gap-2'>
                <span>Nhạc Nền OBS Stream</span>
                {isPlaying && (
                  <span className='flex h-2 w-2 relative'>
                    <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75'></span>
                    <span className='relative inline-flex rounded-full h-2 w-2 bg-emerald-500'></span>
                  </span>
                )}
              </h2>
              <p className='text-[11px] text-amber-300 flex items-center gap-1'>
                <span>📢</span>
                <span>Âm thanh phát tại: <strong>/preview?key={streamKey}</strong> (OBS Browser Source)</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer'
          >
            ✕
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className='flex border-b border-slate-800 bg-slate-950/40 p-2 text-xs font-semibold'>
          {[
            { id: 'youtube', label: 'YouTube', icon: '▶' },
            { id: 'mp3', label: 'Link MP3 Online', icon: '🔗' },
            { id: 'local', label: 'File / Folder Máy', icon: '📁' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSourceType(tab.id as any)
                localStorage.setItem('music_source_type', tab.id)
                syncToPreview({ sourceType: tab.id })
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition cursor-pointer ${
                sourceType === tab.id
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Body content */}
        <div className='flex-1 overflow-y-auto dark-scroll p-5 space-y-4'>
          {/* TAB 1: YOUTUBE */}
          {sourceType === 'youtube' && (
            <div className='space-y-3'>
              <form onSubmit={handlePlayYoutube} className='space-y-2'>
                <label className='block text-xs font-bold text-slate-300'>
                  Dán link Video / Livestream YouTube để phát trên OBS:
                </label>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder='https://www.youtube.com/watch?v=... hoặc youtu.be/...'
                    className='flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none'
                  />
                  <button
                    type='submit'
                    className='rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition cursor-pointer'
                  >
                    Phát ngay
                  </button>
                </div>
              </form>

              {/* Preset Youtube Links */}
              <div className='space-y-1.5'>
                <span className='text-[10px] uppercase font-bold text-slate-500 tracking-wider'>
                  Kênh nhạc livestream gợi ý:
                </span>
                <div className='flex flex-wrap gap-1.5 text-xs'>
                  {[
                    { name: 'Lofi Girl Live 🎧', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
                    { name: 'Chill Beats ☕', url: 'https://www.youtube.com/watch?v=5qap5aO4i9A' },
                    { name: 'Acoustic Guitar 🎸', url: 'https://www.youtube.com/watch?v=2tKzGekHjQ4' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setYoutubeUrl(preset.url)
                        const id = extractYouTubeId(preset.url)
                        if (id) {
                          setCurrentYoutubeId(id)
                          setIsPlaying(true)
                          localStorage.setItem('music_yt_url', preset.url)
                          syncToPreview({
                            sourceType: 'youtube',
                            youtubeId: id,
                            youtubeUrl: preset.url,
                            isPlaying: true,
                          })
                        }
                      }}
                      className='rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-indigo-300 hover:border-indigo-500/50 hover:bg-indigo-950/40 transition cursor-pointer'
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LINK MP3 ONLINE */}
          {sourceType === 'mp3' && (
            <div className='space-y-3'>
              <form onSubmit={handlePlayMp3} className='space-y-2'>
                <label className='block text-xs font-bold text-slate-300'>
                  Nhập link trực tiếp file Audio (.mp3, .m4a, stream):
                </label>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    value={mp3Url}
                    onChange={(e) => setMp3Url(e.target.value)}
                    placeholder='https://example.com/music.mp3'
                    className='flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none'
                  />
                  <button
                    type='submit'
                    className='rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition cursor-pointer'
                  >
                    Phát ngay
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: LOCAL FILE / FOLDER TRÊN MÁY */}
          {sourceType === 'local' && (
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-2.5'>
                <button
                  type='button'
                  onClick={handlePickFolder}
                  className='flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-500/40 bg-indigo-950/20 p-4 text-center hover:bg-indigo-950/40 transition cursor-pointer'
                >
                  <span className='text-2xl mb-1'>📁</span>
                  <span className='text-xs font-bold text-indigo-300'>Chọn Cả Thư Mục</span>
                  <span className='text-[10px] text-slate-400'>Quét tất cả bài hát trong folder</span>
                </button>
                <button
                  type='button'
                  onClick={handlePickFiles}
                  className='flex flex-col items-center justify-center rounded-xl border border-dashed border-purple-500/40 bg-purple-950/20 p-4 text-center hover:bg-purple-950/40 transition cursor-pointer'
                >
                  <span className='text-2xl mb-1'>🎵</span>
                  <span className='text-xs font-bold text-purple-300'>Chọn Nhiều File MP3</span>
                  <span className='text-[10px] text-slate-400'>Chọn từng file tuỳ thích</span>
                </button>
              </div>

              {localTracks.length > 0 && (
                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between text-xs text-slate-400'>
                    <span>Danh sách phát ({localTracks.length} bài):</span>
                    <button
                      onClick={() => {
                        setLocalTracks([])
                        syncToPreview({ playlist: [], isPlaying: false })
                      }}
                      className='text-[11px] text-red-400 hover:underline cursor-pointer'
                    >
                      Xóa danh sách
                    </button>
                  </div>
                  <div className='max-h-44 overflow-y-auto dark-scroll rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/60'>
                    {localTracks.map((tr, idx) => (
                      <div
                        key={tr.id}
                        onClick={() => playLocalTrack(idx)}
                        className={`flex items-center justify-between px-3 py-2 text-xs transition cursor-pointer ${
                          idx === currentTrackIndex
                            ? 'bg-indigo-500/20 text-indigo-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <div className='flex items-center gap-2 truncate'>
                          <span className='font-mono text-[10px] text-slate-500'>#{idx + 1}</span>
                          <span className='truncate'>{tr.name}</span>
                        </div>
                        {idx === currentTrackIndex && (
                          <span className='text-[10px] text-indigo-400 font-mono'>
                            {isPlaying ? '▶ ĐANG PHÁT' : '⏸ TẠM DỪNG'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Notice */}
          <div className='rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-3 text-[11px] text-slate-300 flex items-start gap-2.5'>
            <span className='text-base shrink-0'>💡</span>
            <div>
              <p className='font-semibold text-indigo-200'>
                Nhạc phát trực tiếp tại Browser Source OBS:
              </p>
              <p className='text-slate-400 mt-0.5'>
                Bật Browser Source trên OBS trỏ vào <strong>/preview?key={streamKey}</strong>. Nhạc nền sẽ tự động phát trực tiếp trên luồng live mà không làm ồn máy của streamer.
              </p>
            </div>
          </div>
        </div>

        {/* Global Remote Controller Bar */}
        <div className='border-t border-slate-800 bg-slate-950 px-5 py-3.5 space-y-2.5'>
          <div className='flex items-center justify-between text-xs'>
            <div className='truncate max-w-[260px]'>
              <span className='text-slate-400 text-[10px] uppercase font-bold block'>
                Bài đang phát trên OBS:
              </span>
              <span className='font-semibold text-white truncate block'>
                {currentPlayingTitle}
              </span>
            </div>

            {/* Play/Pause & Track Buttons */}
            <div className='flex items-center gap-1.5'>
              {sourceType === 'local' && (
                <button
                  onClick={handlePrevTrack}
                  className='rounded-lg bg-slate-800 p-1.5 text-xs text-white hover:bg-slate-700 cursor-pointer'
                  title='Bài trước'
                >
                  ⏮
                </button>
              )}
              <button
                onClick={handleTogglePlay}
                className='rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition cursor-pointer shadow-md'
              >
                {isPlaying ? 'Tạm dừng ⏸' : 'Phát trên OBS ▶'}
              </button>
              {sourceType === 'local' && (
                <button
                  onClick={handleNextTrack}
                  className='rounded-lg bg-slate-800 p-1.5 text-xs text-white hover:bg-slate-700 cursor-pointer'
                  title='Bài tiếp theo'
                >
                  ⏭
                </button>
              )}
            </div>
          </div>

          {/* Volume and Loop bar */}
          <div className='flex items-center gap-3 pt-1 border-t border-slate-800/80 text-xs text-slate-400'>
            <button
              onClick={() => {
                const nextMuted = !isMuted
                setIsMuted(nextMuted)
                syncToPreview({ volume: nextMuted ? 0 : volume })
              }}
              className='cursor-pointer hover:text-white'
              title={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted || volume === 0 ? '🔇' : volume > 50 ? '🔊' : '🔉'}
            </button>
            <input
              type='range'
              min='0'
              max='100'
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className='h-1.5 flex-1 accent-indigo-500 cursor-pointer bg-slate-800 rounded'
            />
            <span className='font-mono text-[10px] w-8 text-right'>
              {isMuted ? '0%' : `${volume}%`}
            </span>

            <button
              onClick={handleToggleLoop}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold border transition cursor-pointer ${
                isLoop
                  ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-300'
                  : 'border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title='Lặp lại'
            >
              🔁 Lặp lại
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
