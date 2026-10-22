import { useState } from 'react'
import { fakerVI, fakerEN, fakerJA, fakerKO } from '@faker-js/faker'

const VI_COMMENTS = [
  'In giúp em với shop ơi!',
  'Ảnh đẹp quá trời luôn',
  'Cho mình xin 1 slot với ạ',
  'Shop in nhanh ghê, tuyệt vời',
  'Hóng ảnh của em quá',
  'Avatar này lên khung chắc đẹp lắm',
  'Một slot nhé shop',
  'Vừa vào xem live là mê luôn',
  'Ủng hộ shop 1 tim nha',
  'Lên màu xuất sắc luôn ạ',
  'Shop in giúp mình với nhé',
  'Chúc phiên live đông khách ạ ❤️',
]

const EN_COMMENTS = [
  'Please print mine!',
  'Love this stream so much!',
  'Awesome 3D printer! 🔥',
  'Can I get a slot please?',
  'So satisfying to watch',
  'Great work streamer!',
  'Looking forward to my picture',
  'Subscribed and liked!',
]

const VI_GIFTS = [
  { name: 'Hoa hồng', diamonds: 1 },
  { name: 'Kem ốc quế', diamonds: 1 },
  { name: 'Trái tim', diamonds: 5 },
  { name: 'Mũ len', diamonds: 10 },
  { name: 'Nước hoa', diamonds: 20 },
  { name: 'Vương miện', diamonds: 50 },
  { name: 'Sư tử', diamonds: 100 },
  { name: 'Tên lửa VIP', diamonds: 500 },
]

const EN_GIFTS = [
  { name: 'Rose', diamonds: 1 },
  { name: 'Ice Cream', diamonds: 1 },
  { name: 'Heart', diamonds: 5 },
  { name: 'Cap', diamonds: 10 },
  { name: 'Perfume', diamonds: 20 },
  { name: 'Crown', diamonds: 50 },
  { name: 'Lion', diamonds: 100 },
]

export function FakerBatchModal({
  isOpen,
  onClose,
  sessionId,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  onSuccess: (count: number) => void
}) {
  const [count, setCount] = useState(20)
  const [vipPercent, setVipPercent] = useState(25)
  const [locale, setLocale] = useState<'vi' | 'en' | 'ja' | 'ko'>('vi')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const vipCount = Math.round((count * vipPercent) / 100)
  const normalCount = count - vipCount

  const handleGenerate = async () => {
    setIsSubmitting(true)
    try {
      const faker =
        locale === 'vi'
          ? fakerVI
          : locale === 'ja'
          ? fakerJA
          : locale === 'ko'
          ? fakerKO
          : fakerEN

      const comments = locale === 'vi' ? VI_COMMENTS : EN_COMMENTS
      const gifts = locale === 'vi' ? VI_GIFTS : EN_GIFTS

      const items: Array<{
        uniqueId: string
        name: string
        photoUrl: string
        priority: number
        isVip: boolean
        source: string
        comment?: string
        giftName?: string
      }> = []

      for (let i = 0; i < count; i++) {
        const isVip = i < vipCount
        const name = faker.person.fullName()
        // Random avatar from pravatar / dicebear
        const avatarId = Math.floor(Math.random() * 70) + 1
        const photoUrl = `https://i.pravatar.cc/150?img=${avatarId}`

        if (isVip) {
          const gift = gifts[Math.floor(Math.random() * gifts.length)]
          items.push({
            uniqueId: `faker_vip_${Date.now()}_${i}`,
            name,
            photoUrl,
            priority: 10000 + gift.diamonds,
            isVip: true,
            source: 'gift',
            giftName: `${gift.name} (${gift.diamonds} xu)`,
          })
        } else {
          const isChat = Math.random() > 0.3
          const comment = comments[Math.floor(Math.random() * comments.length)]
          items.push({
            uniqueId: `faker_user_${Date.now()}_${i}`,
            name,
            photoUrl,
            priority: isChat ? 30 : 10,
            isVip: false,
            source: isChat ? 'chat' : 'member',
            comment: isChat ? comment : 'Vừa vào xem live',
          })
        }
      }

      // Shuffle so VIPs are distributed naturally, though backend priority will order them
      items.sort(() => Math.random() - 0.5)

      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke('queue:add-batch', {
          sessionId,
          items,
        })
      }

      onSuccess(count)
      onClose()
    } catch (err) {
      console.error('Error generating fake queue:', err)
      alert('Có lỗi xảy ra khi tạo khán giả ảo')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4'>
      <div className='flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60'>
          <div className='flex items-center gap-2.5'>
            <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 text-lg border border-purple-500/30'>
              👥
            </span>
            <div>
              <h2 className='text-sm font-bold text-white'>
                Thêm Khán Giả Hàng Loạt (Faker AI)
              </h2>
              <p className='text-[11px] text-slate-400'>
                Tạo avatar, tên và tương tác sống động để test máy in
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

        {/* Form Body */}
        <div className='p-5 space-y-4 text-xs'>
          {/* Số lượng */}
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <label className='font-bold text-slate-300'>Số lượng khán giả:</label>
              <span className='font-mono font-bold text-cyan-400 text-sm'>{count} người</span>
            </div>
            <div className='flex gap-1.5'>
              {[10, 20, 30, 50, 100].map((num) => (
                <button
                  key={num}
                  type='button'
                  onClick={() => setCount(num)}
                  className={`flex-1 rounded-lg py-1.5 font-bold transition cursor-pointer border ${
                    count === num
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  +{num}
                </button>
              ))}
            </div>
          </div>

          {/* Ngôn ngữ */}
          <div className='space-y-1.5'>
            <label className='font-bold text-slate-300 block'>Ngôn ngữ & phong cách tên:</label>
            <div className='grid grid-cols-2 gap-2'>
              {[
                { id: 'vi', label: 'Tiếng Việt 🇻🇳', desc: 'Tên Việt & bình luận tự nhiên' },
                { id: 'en', label: 'Tiếng Anh 🇺🇸', desc: 'English names & gifts' },
                { id: 'ja', label: 'Tiếng Nhật 🇯🇵', desc: 'Japanese names' },
                { id: 'ko', label: 'Tiếng Hàn 🇰🇷', desc: 'Korean names' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type='button'
                  onClick={() => setLocale(lang.id as any)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    locale === lang.id
                      ? 'border-purple-500 bg-purple-500/20 text-white font-bold'
                      : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <span className='text-xs'>{lang.label}</span>
                  <span className='text-[10px] text-slate-500 font-normal'>{lang.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tỉ lệ VIP / Thường */}
          <div className='space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3'>
            <div className='flex items-center justify-between'>
              <label className='font-bold text-slate-300'>Tỉ lệ VIP tặng quà:</label>
              <span className='font-mono font-bold text-amber-400'>{vipPercent}% VIP</span>
            </div>
            <input
              type='range'
              min='0'
              max='100'
              step='5'
              value={vipPercent}
              onChange={(e) => setVipPercent(Number(e.target.value))}
              className='h-1.5 w-full accent-amber-500 cursor-pointer bg-slate-800 rounded'
            />
            <div className='flex items-center justify-between text-[11px] pt-1'>
              <span className='flex items-center gap-1 font-semibold text-amber-300'>
                👑 {vipCount} người VIP (Quà to)
              </span>
              <span className='text-slate-400'>
                💬 {normalCount} người thường (Chat/Xem)
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className='flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/80 px-5 py-3.5'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer'
          >
            Hủy
          </button>
          <button
            type='button'
            disabled={isSubmitting}
            onClick={handleGenerate}
            className='flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:from-purple-500 hover:to-cyan-500 transition cursor-pointer disabled:opacity-50'
          >
            <span>{isSubmitting ? 'Đang tạo...' : `🚀 Thêm Ngay ${count} Khán Giả`}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
