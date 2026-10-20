const messages = [
  'Студенты слегка проспали, уже мчатся к вам. Просьба немного подождать :)',
  'Дружище, подожди минутку — девчонки прихорашиваются :)',
  'Алло, зачёт? — Да-да, опаздываем, будем через минуту!!!',
  'Ищем аудиторию. Кажется, опять пришли не в тот корпус…',
  'Шпаргалки спрятаны, кофе допит. Студенты уже на подходе!',
];
let cancelCurrent = () => {};

export function stopCharacterLoading(): void { cancelCurrent(); }

export function beginCharacterLoading(): () => void {
  cancelCurrent();
  const card = document.getElementById('character-loading');
  const text = document.getElementById('character-loading-message');
  let index = Math.floor(Math.random() * messages.length);
  let rotation: number | undefined;
  const delay = window.setTimeout(() => {
    if (!card || !text) return;
    text.textContent = messages[index];
    card.hidden = false;
    document.body.classList.add('character-loading-active');
    rotation = window.setInterval(() => {
      index = (index + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
      text.textContent = messages[index];
    }, 4000);
  }, 180);
  const cancel = () => {
    window.clearTimeout(delay);
    window.clearInterval(rotation);
    if (card) card.hidden = true;
    document.body.classList.remove('character-loading-active');
    if (cancelCurrent === cancel) cancelCurrent = () => {};
  };
  cancelCurrent = cancel;
  // An obsolete sprite's completion must not hide a newer loading request.
  return () => { if (cancelCurrent === cancel) cancel(); };
}
