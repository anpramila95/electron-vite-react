import { TikTokLiveConnection } from 'tiktok-live-connector';

const tiktok = new TikTokLiveConnection('respawnandride', {});

tiktok.connect()
  .then(state => console.log(`Connected: ${state.roomId}`))
  .catch(err => console.error('Connect failed:', err.message));

tiktok.on('gift', data => {
  // ponytail: bo streak dang tang neu gift ho tro combo, chi nhan khi combo xong (repeatEnd !== 0)
  if (data.gift?.combo && data.repeatEnd === 0) return;

  const diamonds = data.gift?.diamondCount || data.fanTicketCount || 0;
  const count = data.repeatCount || 1;
  const total = diamonds * count;

  const username = data.user?.displayId || data.user?.nickname || 'An danh';
  const giftName = data.gift?.name || 'Qua';

  console.log(`[${total} xu/kim cuong] @${username} tang ${count}x ${giftName} (${diamonds}/qua)`);
});
