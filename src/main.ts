import './style.css';
import './achievements.css';
import './mobile.css';
import { isPhoneLayout, setupPhoneOrientation } from './mobile';
import { AudioCue, unlockCueAudio } from './cue-audio';
import { beginCharacterLoading, stopCharacterLoading } from './character-loading';
import { coverScene, revealScene, transitionScene } from './transitions';
import { createAudio } from './media';
import { loadImage, warmImages, readyImages, prepareAudio, prepareMedia, swapImage } from './asset-loading';
import { gameStorage } from './storage';

type Gender = 'male' | 'female';
type SelectionState = { gender: Gender; malePreset: number; femalePreset: number };
const STORAGE_KEY = 'last-exam-character-selection';
const SECRET_UNLOCK_KEY = 'last-exam-hesoyam-unlocked';
const DEVIL_UNLOCK_KEY = 'last-exam-devil-unlocked';
const ACHIEVEMENTS_STORAGE_KEY = 'last-exam-achievements-v1';
const FIRST_COMPLETED_ARCHETYPE_KEY = 'last-exam-first-completed-archetype';
const ACHIEVEMENTS = [
  { id: 'history-keeper', title: 'Хранитель истории КИУ', description: 'Сдать зачёт на отлично (6–7 правильных ответов).', icon: '📚' },
  { id: 'result-first', title: 'Главное — результат', description: 'Сдать зачёт (4–5 правильных ответов).', icon: '☑️' },
  { id: 'retake-legend', title: 'Легенда пересдачи', description: 'Провалить зачёт (0–3 правильных ответа).', icon: '🧾' },
  { id: 'too-clever', title: 'Слишком хитрый', description: 'Совершить 3 и более попыток списывания.', icon: '📝' },
  { id: 'hello', title: 'Привет!', description: 'Поздороваться с Артуром.', icon: '🤝' },
  { id: 'credits-respect', title: 'Уважаемый человек', description: 'Досмотреть титры до конца, не нажимая «Пропустить».', icon: '🎞️' },
  { id: 'hesoyam', title: 'HESOYAM', description: 'Ввести секретный код в меню выбора персонажа.', icon: '🟩', hidden: true },
  { id: 'the-end', title: 'Конец...?', description: 'Завершить прохождение и дойти до итогового экрана.', icon: '🎬' },
  { id: 'director', title: 'Сам себе режиссёр', description: 'Завершить прохождение за архетип, отличный от архетипа первого прохождения.', icon: '🎭', hidden: true },
  { id: 'teacher-patience', title: 'Терпение преподавателя', description: 'Довести усталость преподавательницы до критического уровня.', icon: '🔥', hidden: true },
  { id: 'jack-of-all-trades', title: 'На все руки мастер', description: 'Завершить игру за архетип «Универсал».', icon: '🎓' },
  { id: 'only-the-beginning', title: 'Это только начало', description: 'Начать повторное прохождение после первого завершения игры.', icon: '🔁' },
] as const;
type AchievementId = typeof ACHIEVEMENTS[number]['id'];
function readUnlockedAchievements(): string[] {
  try { const value = JSON.parse(gameStorage.getItem(ACHIEVEMENTS_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
}
function unlockAchievement(id: AchievementId): void {
  const unlocked = readUnlockedAchievements();
  if (unlocked.includes(id)) return;
  unlocked.push(id);
  gameStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(unlocked));
  const achievement = ACHIEVEMENTS.find(item => item.id === id);
  if (achievement) showAchievementNotification(achievement);
  window.dispatchEvent(new CustomEvent('game:achievement-unlocked', { detail: { id } }));
}

// Queue unlocks so simultaneous achievement rewards never overlap.
let achievementNotificationQueue: Array<(typeof ACHIEVEMENTS)[number]> = [];
let achievementNotificationActive = false;
let achievementNotificationStylesAdded = false;
const ACHIEVEMENT_UNLOCK_SOUND = '/audio/achievements/steam-achievement.mp3';
function playAchievementSound(): void {
  const source = ACHIEVEMENT_UNLOCK_SOUND;
  const sound = createAudio(source);
  sound.volume = 0.82;
  void sound.play().catch((error) => console.warn('Achievement sound could not start:', error));
}
function showAchievementNotification(achievement: (typeof ACHIEVEMENTS)[number]): void {
  achievementNotificationQueue.push(achievement);
  if (!achievementNotificationActive) showNextAchievementNotification();
}
function showNextAchievementNotification(): void {
  const achievement = achievementNotificationQueue.shift();
  if (!achievement) { achievementNotificationActive = false; return; }
  achievementNotificationActive = true;
  if (!achievementNotificationStylesAdded) {
    const style = document.createElement('style');
    style.id = 'achievement-unlock-toast-styles';
    style.textContent = `
      @keyframes achievement-card-enter { 0% { transform:translateX(calc(-100% - 36px)); opacity:0; } 72% { transform:translateX(8px); opacity:1; } 100% { transform:translateX(0); opacity:1; } }
      @keyframes achievement-card-exit { from { transform:translateX(0); opacity:1; } to { transform:translateX(calc(-100% - 36px)); opacity:0; } }
      @keyframes achievement-card-glow { 0%,100% { box-shadow:0 10px 35px rgba(0,0,0,.45),0 0 0 rgba(89,220,255,0); } 50% { box-shadow:0 10px 35px rgba(0,0,0,.45),0 0 22px rgba(89,220,255,.35); } }
      @media(prefers-reduced-motion:reduce){#achievement-unlock-toast{animation:none!important;opacity:1!important;transform:none!important}}
    `;
    document.head.appendChild(style);
    achievementNotificationStylesAdded = true;
  }
  document.getElementById('achievement-unlock-toast')?.remove();
  const card = document.createElement('aside');
  card.id = 'achievement-unlock-toast';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const index = ACHIEVEMENTS.findIndex(item => item.id === achievement.id) + 1;
  const accent = index <= 6 ? '#62e5ff' : '#ff69d4';
  Object.assign(card.style, {
    position:'fixed', top:'18px', left:'18px', zIndex:'2147483647', width:'min(390px, calc(100vw - 36px))',
    minHeight:'104px', boxSizing:'border-box', display:'flex', alignItems:'center', gap:'14px', padding:'13px 16px 13px 13px',
    color:'#f7f8ff', background:'linear-gradient(112deg, rgba(8,10,20,.98), rgba(18,22,38,.96))',
    border:`1px solid ${accent}`, borderLeft:`4px solid ${accent}`, borderRadius:'4px',
    fontFamily:'Arial,sans-serif', overflow:'hidden', opacity:'0', transform:'translateX(calc(-100% - 36px))',
    backdropFilter:'blur(10px)', animation:'achievement-card-enter .62s cubic-bezier(.2,.8,.2,1) forwards, achievement-card-glow 1.4s ease-in-out .65s 2',
    pointerEvents:'none',
  });
  const iconFrame = document.createElement('div'); iconFrame.className = 'achievement-toast-icon';
  Object.assign(iconFrame.style, { flex:'0 0 72px', width:'72px', height:'72px', display:'grid', placeItems:'center', background:`linear-gradient(145deg, ${accent}20, rgba(0,0,0,.18))`, border:`1px solid ${accent}80`, borderRadius:'3px', overflow:'hidden' });
  const iconImage = document.createElement('img');
  iconImage.src = `/assets/achievements/icons/achievement-${String(index).padStart(2, '0')}.webp`;
  iconImage.alt = '';
  Object.assign(iconImage.style, { width:'90%', height:'90%', objectFit:'contain', filter:`drop-shadow(0 0 7px ${accent}80)` });
  iconImage.onerror = () => { iconImage.remove(); iconFrame.textContent = achievement.icon; iconFrame.style.fontSize = '36px'; };
  iconFrame.appendChild(iconImage);
  const content = document.createElement('div'); content.className = 'achievement-toast-copy';
  Object.assign(content.style, { minWidth:'0', display:'flex', flexDirection:'column', gap:'5px' });
  const kicker = document.createElement('div'); kicker.className = 'achievement-toast-kicker'; kicker.textContent = 'ДОСТИЖЕНИЕ ПОЛУЧЕНО';
  Object.assign(kicker.style, { color:accent, fontSize:'10px', fontWeight:'800', letterSpacing:'1.5px', textShadow:`0 0 10px ${accent}55` });
  const title = document.createElement('div'); title.className = 'achievement-toast-title'; title.textContent = achievement.title;
  Object.assign(title.style, { fontSize:'16px', lineHeight:'1.2', fontWeight:'800', overflowWrap:'anywhere', textShadow:'0 1px 3px #000' });
  const description = document.createElement('div'); description.className = 'achievement-toast-description'; description.textContent = achievement.description;
  Object.assign(description.style, { color:'#b9c2d5', fontSize:'11px', lineHeight:'1.35', marginTop:'1px' });
  content.append(kicker, title, description); card.append(iconFrame, content); document.body.appendChild(card);
  playAchievementSound();
  window.setTimeout(() => {
    if (!card.isConnected) { achievementNotificationActive = false; showNextAchievementNotification(); return; }
    card.style.animation = 'achievement-card-exit .42s ease-in forwards';
    window.setTimeout(() => { card.remove(); achievementNotificationActive = false; showNextAchievementNotification(); }, 440);
  }, 3900);
}
function normalizeArchetypeName(name: string): string { return name.normalize('NFC').trim().toLocaleUpperCase('ru-RU'); }
function recordCompletedArchetype(name: string): void {
  const current = normalizeArchetypeName(name || getArchetype().name);
  const first = gameStorage.getItem(FIRST_COMPLETED_ARCHETYPE_KEY);
  if (!first) gameStorage.setItem(FIRST_COMPLETED_ARCHETYPE_KEY, current);
  else if (normalizeArchetypeName(first) !== current) unlockAchievement('director');
  if (current.includes('УНИВЕРСАЛ') || current.includes('UNIVERSAL')) unlockAchievement('jack-of-all-trades');
}
const achievementAssets = [
  '/assets/achievements/campus-background.webp',
  ...Array.from({ length: 12 }, (_, index) => `/assets/achievements/icons/achievement-${String(index + 1).padStart(2, '0')}.webp`),
];
const resultAssets = ['/assets/campus-background.webp', '/assets/endings/final-screen/passbook.webp'];
let achievementsOpening = false;
function hasCompletedRun(): boolean {
  return Boolean(gameStorage.getItem(FIRST_COMPLETED_ARCHETYPE_KEY)) || readUnlockedAchievements().includes('the-end');
}
function syncMenuAchievementsButton(): void {
  const button = document.getElementById('start-achievements-button') as HTMLButtonElement | null;
  if (button) button.hidden = !hasCompletedRun();
}
async function showAchievementsPage(origin: 'results' | 'menu' = 'results'): Promise<void> {
  if (achievementsOpening || document.getElementById('achievements-page-overlay')) return;
  if (origin === 'menu' && !hasCompletedRun()) return;
  achievementsOpening = true;
  const sourceScreen = origin === 'menu' ? startScreen : document.getElementById('final-result-screen');
  try { await readyImages(achievementAssets.slice(0, 1)); } finally { achievementsOpening = false; }
  if (!sourceScreen?.isConnected || sourceScreen.classList.contains('is-hidden')) return;
  const overlay = document.createElement('div'); overlay.id = 'achievements-page-overlay';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'achievement-heading');
  const background = document.createElement('img');
  background.className = 'achievements-background'; background.src = achievementAssets[0]; background.alt = '';
  const panel = document.createElement('section'); panel.className = 'achievements-book';
  const heading = document.createElement('h1'); heading.className = 'achievement-heading';
  heading.id = 'achievement-heading'; heading.textContent = 'ДОСТИЖЕНИЯ';
  const list = document.createElement('div'); list.className = 'achievements-list'; list.setAttribute('role', 'list');
  const unlocked = readUnlockedAchievements();
  ACHIEVEMENTS.forEach((achievement, index) => {
    const isUnlocked = unlocked.includes(achievement.id);
    const hidden = Boolean((achievement as { hidden?: boolean }).hidden) && !isUnlocked;
    const item = document.createElement('article');
    item.className = `achievement-item ${isUnlocked ? 'is-unlocked' : 'is-locked'}`;
    item.dataset.achievement = achievement.id;
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', `${hidden ? 'Скрытое достижение' : achievement.title}: ${isUnlocked ? 'получено' : 'закрыто'}`);
    const icon = document.createElement('div'); icon.className = 'achievement-item-icon';
    icon.setAttribute('aria-hidden', 'true'); icon.textContent = achievement.icon;
    const image = document.createElement('img');
    image.src = `/assets/achievements/icons/achievement-${String(index + 1).padStart(2, '0')}.webp`;
    image.alt = ''; image.decoding = 'async';
    image.onload = () => { if (icon.firstChild?.nodeType === Node.TEXT_NODE) icon.firstChild.remove(); };
    image.onerror = () => image.remove();
    icon.appendChild(image);
    const copy = document.createElement('div'); copy.className = 'achievement-item-copy';
    const title = document.createElement('div'); title.className = 'achievement-item-title';
    title.textContent = hidden ? '???' : achievement.title;
    const description = document.createElement('div'); description.className = 'achievement-item-description';
    description.textContent = hidden ? 'Скрытое достижение. Условия неизвестны.' : achievement.description;
    copy.append(title, description); item.append(icon, copy); list.appendChild(item);
  });
  const footer = document.createElement('footer'); footer.className = 'achievement-footer';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'achievement-back';
  close.textContent = 'НАЗАД';
  const trigger = document.activeElement as HTMLElement | null;
  close.addEventListener('click', () => { overlay.remove(); trigger?.focus({ preventScroll: true }); });
  const count = document.createElement('div'); count.className = 'achievement-count';
  count.textContent = `${ACHIEVEMENTS.filter(achievement => unlocked.includes(achievement.id)).length} / ${ACHIEVEMENTS.length}`;
  footer.append(close, count); panel.append(heading, list, footer); overlay.append(background, panel);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('is-visible'); close.focus({ preventScroll: true }); });
}
const SECRET_MALE_PRESET = 5; // индекс 5 — Карл Джонсон
const DEVIL_MALE_PRESET = 6; // индекс 6 — Мик Томпсон
let secretPresetUnlocked = gameStorage.getItem(SECRET_UNLOCK_KEY) === 'true';
let devilPresetUnlocked = gameStorage.getItem(DEVIL_UNLOCK_KEY) === 'true';
let cheatBuffer = '';
const cheatActivationSound = createAudio('/audio/easter-eggs/hesoyam-activation.mp3');
cheatActivationSound.preload = 'none';
cheatActivationSound.volume = 0.9;
const devilActivationSound = createAudio('/audio/easter-eggs/devil-activation.mp3');
devilActivationSound.preload = 'none';
devilActivationSound.volume = 0.9;
const secretClassroomSound = createAudio('/audio/easter-eggs/ah-shit-here-we-go-again.mp3');
secretClassroomSound.preload = 'none';
secretClassroomSound.volume = 1;

const defaultState: SelectionState = { gender: 'male', malePreset: 0, femalePreset: 0 };

function loadSelection(): SelectionState {
  try {
    const raw = gameStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw) as Partial<SelectionState>;
    return {
      gender: parsed.gender === 'female' ? 'female' : 'male',
      malePreset: validIndex(parsed.malePreset),
      femalePreset: validIndex(parsed.femalePreset, 4),
    };
  } catch {
    return { ...defaultState };
  }
}
function validIndex(value: unknown, maximum = DEVIL_MALE_PRESET): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) return 0;
  if (value === SECRET_MALE_PRESET && !secretPresetUnlocked) return 0;
  if (value === DEVIL_MALE_PRESET && !devilPresetUnlocked) return 0;
  return value;
}

let selection = loadSelection();
const startScreen = document.querySelector<HTMLElement>('#start-screen');
const characterScreen = document.querySelector<HTMLElement>('#character-screen');
const maleBoySprites = Array.from({length: 7}, (_, i) => document.querySelector<HTMLImageElement>(`#male-boy${i + 1}-sprite`));
const femaleGirl1Sprite = document.querySelector<HTMLImageElement>('#female-girl1-sprite');
const femaleGirl2Sprite = document.querySelector<HTMLImageElement>('#female-girl2-sprite');
const femaleGirl3Sprite = document.querySelector<HTMLImageElement>('#female-girl3-sprite');
const femaleGirl4Sprite = document.querySelector<HTMLImageElement>('#female-girl4-sprite');
const femaleGirl5Sprite = document.querySelector<HTMLImageElement>('#female-girl5-sprite');
const characterSprites: Record<string, HTMLImageElement | null> = { male1: maleBoySprites[0], male2: maleBoySprites[1], male3: maleBoySprites[2], male4: maleBoySprites[3], male5: maleBoySprites[4], male6: maleBoySprites[5], male7: maleBoySprites[6], female1: femaleGirl1Sprite, female2: femaleGirl2Sprite, female3: femaleGirl3Sprite, female4: femaleGirl4Sprite, female5: femaleGirl5Sprite };
type CharacterEmotion = 'normal' | 'confident' | 'smile' | 'thinking' | 'worried';
let activeEmotion: CharacterEmotion = 'normal';
const emotionNames: CharacterEmotion[] = ['normal', 'confident', 'smile', 'thinking', 'worried'];
function selectedCharacterKey(): string { return selection.gender === 'female' ? `female${selection.femalePreset + 1}` : `male${selection.malePreset + 1}`; }
function selectedSpritePath(emotion: CharacterEmotion = 'normal'): string {
  return teacherPlayerSpriteSrc(emotion);
}
function warmSelectedEmotions(): void {
  warmImages(emotionNames.map(emotion => selectedSpritePath(emotion)));
}
const selectionAssets = ['/assets/character_select_background.webp', '/assets/character_selector_male.webp', '/assets/character_selector_female.webp'];
const corridorAssets = ['/assets/corridor-background.webp', '/assets/corridor-dialogue-frame.webp'];
const classroomAssets = ['/assets/classroom-last-exam-background.webp', '/assets/corridor-dialogue-frame.webp'];
function applyCharacterEmotion(emotion: string = 'normal'): void {
  activeEmotion = emotionNames.includes(emotion as CharacterEmotion) ? emotion as CharacterEmotion : 'normal';
  const key = selectedCharacterKey();
  const sprite = characterSprites[key];
  const folder = key.startsWith('female') ? key.replace('female', 'student_girl') : key === 'male6' ? 'student_male6' : key === 'male7' ? 'student_male7' : key.replace('male', 'student_boy');
  const emotionSrc = `/assets/characters/${folder}/${activeEmotion}.webp`;
  if (sprite && !characterScreen?.classList.contains('is-hidden')) {
    void swapImage(sprite, emotionSrc);
    sprite.alt = `Выбранный персонаж: ${activeEmotion === 'normal' ? 'обычное состояние' : activeEmotion}`;
  }
  const storySprite = document.getElementById('corridor-character-sprite') as HTMLImageElement | null;
  if (storySprite && !document.getElementById('corridor-screen')?.classList.contains('is-hidden')) {
    storySprite.onerror = () => {
      storySprite.onerror = null;
      storySprite.src = selection.gender === 'female'
        ? `/assets/characters/student_girl${selection.femalePreset + 1}/card.webp`
        : selection.malePreset === SECRET_MALE_PRESET ? '/assets/characters/student_male6/card.webp' : selection.malePreset === DEVIL_MALE_PRESET ? '/assets/characters/student_male7/card.webp' : `/assets/characters/student_boy${selection.malePreset + 1}/card.webp`;
      storySprite.classList.add('is-fallback');
    };
    storySprite.classList.remove('is-fallback');
    const motionByEmotion: Record<CharacterEmotion, string> = {
      normal: 'motion-neutral', thinking: 'motion-thoughtful', confident: 'motion-confident',
      smile: 'motion-happy', worried: 'motion-worried'
    };
    storySprite.classList.remove('emotion-crossfade', 'motion-neutral', 'motion-thoughtful', 'motion-confident', 'motion-happy', 'motion-worried');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (storySprite.getAttribute('src') !== emotionSrc) {
      if (!reduceMotion) storySprite.classList.add('emotion-crossfade');
      storySprite.addEventListener('load', () => storySprite.classList.remove('emotion-crossfade'), { once: true });
    }
    // Always register the latest request, even when returning to the visible emotion.
    void swapImage(storySprite, emotionSrc);
    storySprite.dataset.emotion = activeEmotion;
    if (!reduceMotion) storySprite.classList.add(motionByEmotion[activeEmotion]);
  }
}
function renderGenderedDialogue(detail: { targetId?: string; maleText?: string; femaleText?: string }): void {
  if (!detail.targetId) return;
  const target = document.getElementById(detail.targetId);
  if (target) target.textContent = selection.gender === 'female' ? (detail.femaleText ?? detail.maleText ?? '') : (detail.maleText ?? detail.femaleText ?? '');
}
const inputScreen = document.querySelector<HTMLElement>('#input-screen');
const skillsScreen = document.querySelector<HTMLElement>('#skills-screen');
const ticketScreen = document.querySelector<HTMLElement>('#ticket-screen');
const startButton = document.querySelector<HTMLButtonElement>('#start-button');
const continueButton = document.querySelector<HTMLButtonElement>('#continue-button');
const inputBackButton = document.querySelector<HTMLButtonElement>('#input-back-button');
const playerForm = document.querySelector<HTMLFormElement>('#player-form');
const groupInput = document.getElementById('player-group') as HTMLInputElement | null;
if (groupInput) {
  groupInput.inputMode = 'numeric';
  groupInput.pattern = '[0-9]+';
  groupInput.addEventListener('input', () => { groupInput.value = groupInput.value.replace(/[^0-9]/g, ''); });
  groupInput.addEventListener('paste', (event) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') ?? '';
    const start = groupInput.selectionStart ?? groupInput.value.length;
    const end = groupInput.selectionEnd ?? start;
    groupInput.setRangeText(pasted.replace(/[^0-9]/g, ''), start, end, 'end');
    groupInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function isSecretPresetSelected(): boolean { return selection.gender === 'male' && selection.malePreset === SECRET_MALE_PRESET && secretPresetUnlocked; }
function isDevilPresetSelected(): boolean { return selection.gender === 'male' && selection.malePreset === DEVIL_MALE_PRESET && devilPresetUnlocked; }
function syncSecretIdentity(): void {
  const surname = document.getElementById('player-surname') as HTMLInputElement | null;
  const givenName = document.getElementById('player-name') as HTMLInputElement | null;
  if (!surname || !givenName) return;
  const secret = isSecretPresetSelected();
  if (secret) { surname.value = 'Джонсон'; givenName.value = 'Карл'; }
  surname.readOnly = secret;
  givenName.readOnly = secret;
  surname.setAttribute('aria-readonly', String(secret));
  givenName.setAttribute('aria-readonly', String(secret));
  surname.classList.toggle('is-locked', secret);
  givenName.classList.toggle('is-locked', secret);
  if (secret) { surname.title = 'Имя секретного персонажа нельзя изменить'; givenName.title = 'Имя секретного персонажа нельзя изменить'; }
  else { surname.removeAttribute('title'); givenName.removeAttribute('title'); }
}
const inputToast = document.querySelector<HTMLElement>('#input-toast');
const skillsContinue = document.querySelector<HTMLButtonElement>('#skills-continue');
const skillsBack = document.querySelector<HTMLButtonElement>('#skills-back');
const pointsLeft = document.querySelector<HTMLElement>('#points-left');
const archetypeName = document.querySelector<HTMLElement>('#archetype-name');
const archetypeDescription = document.querySelector<HTMLElement>('#archetype-description');
const archetypeBonus = document.querySelector<HTMLElement>('#archetype-bonus');
const archetypeEmblem = document.querySelector<HTMLElement>('#archetype-emblem');
const skillsStatus = document.querySelector<HTMLElement>('#skills-status');
const skillsWarning = document.querySelector<HTMLElement>('#skills-warning');
const toast = document.querySelector<HTMLElement>('#selection-toast');
const transitionOverlay = document.querySelector<HTMLElement>('#screen-transition');
const introMusic = document.querySelector<HTMLAudioElement>('#intro-music');
const corridorAmbience = document.querySelector<HTMLAudioElement>('#corridor-ambience');

// GTA IV-inspired Now Playing card. This is a local UI only: Spotify links open
// search results and never replace the game's existing local audio files.
type NowPlayingTrack = { title: string; artist: string; spotifyQuery: string; yandexUrl?: string; mood?: 'green' | 'red' | 'blue' | 'yellow'; cover?: string };
let nowPlayingCard: HTMLElement | null = null;
let nowPlayingHideTimer: number | undefined;
function ensureNowPlayingCard(): HTMLElement {
  if (nowPlayingCard?.isConnected) return nowPlayingCard;
  const card = document.createElement('aside');
  card.id = 'now-playing-card';
  card.className = 'now-playing-card';
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', 'Сейчас играет');
  card.innerHTML = `<div class="np-cover" aria-hidden="true"><img class="np-cover-image" alt="" /><span class="np-cover-mark">♫</span><span class="np-equalizer"><i></i><i></i><i></i><i></i></span></div><div class="np-info"><div class="np-kicker">NOW PLAYING</div><a class="np-title-link" target="_blank" rel="noopener noreferrer"><div class="np-title"></div></a><div class="np-artist"></div><div class="np-links"><a class="np-spotify" target="_blank" rel="noopener noreferrer"><span class="np-spotify-dot">●</span> <span class="np-powered">POWERED BY</span> <strong>Spotify</strong><span class="np-external">↗</span></a><a class="np-yandex" target="_blank" rel="noopener noreferrer">Яндекс Музыка ↗</a></div></div><button class="np-close" type="button" aria-label="Скрыть музыкальную карточку">×</button>`;
  document.body.appendChild(card);
  card.querySelector('.np-close')?.addEventListener('click', () => {
    card.classList.remove('is-visible');
    window.setTimeout(() => { if (!card.classList.contains('is-visible')) card.hidden = true; }, 350);
  });
  nowPlayingCard = card;
  return card;
}
function showNowPlaying(track: NowPlayingTrack): void {
  // The intro track can finish starting asynchronously after the character screen
  // has already opened. Never let that late promise reveal the card over selection.
  if (characterScreen && !characterScreen.classList.contains('is-hidden')) {
    hideNowPlaying();
    if (nowPlayingCard) nowPlayingCard.hidden = true;
    return;
  }
  const card = ensureNowPlayingCard();
  if (nowPlayingHideTimer !== undefined) window.clearTimeout(nowPlayingHideTimer);
  card.hidden = false;
  card.classList.remove('np-mood-green', 'np-mood-red', 'np-mood-blue', 'np-mood-yellow');
  card.classList.add(`np-mood-${track.mood ?? 'green'}`);
  const title = card.querySelector<HTMLElement>('.np-title');
  const artist = card.querySelector<HTMLElement>('.np-artist');
  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(track.spotifyQuery || `${track.title} ${track.artist}`)}`;
  const titleLink = card.querySelector<HTMLAnchorElement>('.np-title-link');
  const link = card.querySelector<HTMLAnchorElement>('.np-spotify');
  const yandexLink = card.querySelector<HTMLAnchorElement>('.np-yandex');
  if (title) title.textContent = track.title;
  if (artist) artist.textContent = track.artist;
  const cover = card.querySelector<HTMLElement>('.np-cover');
  const coverImage = card.querySelector<HTMLImageElement>('.np-cover-image');
  const coverMark = card.querySelector<HTMLElement>('.np-cover-mark');
  if (cover && coverImage) {
    // Use a real img element instead of CSS background-image: this avoids
    // background shorthand rules accidentally replacing the album artwork.
    cover.classList.remove('has-cover');
    coverImage.onload = () => {
      cover.classList.add('has-cover');
      if (coverMark) coverMark.hidden = true;
    };
    coverImage.onerror = () => {
      cover.classList.remove('has-cover');
      coverImage.removeAttribute('srcset');
      coverImage.removeAttribute('src');
      if (coverMark) coverMark.hidden = false;
      console.warn(`Album cover could not be loaded: ${track.cover}`);
    };
    if (track.cover) {
      coverImage.sizes = '(pointer: coarse) and (max-width: 1100px) 36px, (max-width: 600px) 58px, 68px';
      coverImage.srcset = `${track.cover.replace('.webp', '-128.webp')} 128w, ${track.cover.replace('.webp', '-256.webp')} 256w, ${track.cover} 1254w`;
      coverImage.src = track.cover;
    } else {
      coverImage.removeAttribute('srcset');
      coverImage.removeAttribute('src');
      if (coverMark) coverMark.hidden = false;
    }
  }
  if (titleLink) titleLink.href = spotifyUrl;
  if (link) link.href = spotifyUrl;
  if (yandexLink) { yandexLink.href = track.yandexUrl || ''; yandexLink.hidden = !track.yandexUrl; }
  requestAnimationFrame(() => card.classList.add('is-visible'));
  nowPlayingHideTimer = window.setTimeout(() => { card.classList.remove('is-visible'); window.setTimeout(() => { if (!card.classList.contains('is-visible')) card.hidden = true; }, 400); }, 3000);
}
function hideNowPlaying(): void {
  if (nowPlayingHideTimer !== undefined) window.clearTimeout(nowPlayingHideTimer);
  nowPlayingHideTimer = undefined;
  const card = nowPlayingCard;
  if (!card) return;
  card.classList.remove('is-visible');
  // Hide immediately as well as animating out, so the card cannot remain visible
  // or intercept clicks while the character-selection menu is on screen.
  card.hidden = true;
}
const buttonClickSfx = createAudio('/audio/ui/button-click.wav');
buttonClickSfx.preload = 'none';
buttonClickSfx.volume = 0.825;
const skillAdjustSfx = createAudio('/audio/ui/skill-adjust.wav');
skillAdjustSfx.preload = 'none';
skillAdjustSfx.volume = 0.975;
const classroomDoorSound = createAudio('/audio/ui/minecraft-door-open.mp3');
classroomDoorSound.preload = 'none';
classroomDoorSound.volume = 0.8;
const arthurHiSound = new AudioCue('/audio/ui/roblox-hi-sound.mp3', 0.8);
const catMeowSound = new AudioCue('/audio/ui/meow-1.mp3', 0.9);

function playUiSound(audio: HTMLAudioElement): void {
  try {
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Ignore browser autoplay restrictions for non-essential UI sounds.
  }
}

document.addEventListener('click', unlockCueAudio, { capture: true });
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('button');
  if (!button || button.disabled) return;
  if (button.matches('[data-delta="-1"], [data-delta="1"]')) {
    playUiSound(skillAdjustSfx);
  } else {
    playUiSound(buttonClickSfx);
  }
}, true);
const archetypeMusic = createAudio();
archetypeMusic.preload = 'none';
archetypeMusic.loop = true;
archetypeMusic.volume = 0;
let archetypeMusicFadeTimer: number | undefined;
let corridorMusicStarted = false;
const classroomMusic = createAudio('/audio/classroom/C418-Aria_Math-clean.mp3');
const endingMusic = createAudio('/audio/endings/gta-iv-ending.mp3');
endingMusic.preload = 'none';
endingMusic.loop = true;
endingMusic.volume = 0.72;
const excellentEndingDoorSound = createAudio('/audio/ui/minecraft-door-open.mp3');
excellentEndingDoorSound.preload = 'none';
excellentEndingDoorSound.volume = 0.8;
const excellentEndingPhoneSound = new AudioCue('/audio/endings/excellent-ending-phone.mp3', 0.9, 0.30);
function playExcellentEndingSound(sound: HTMLAudioElement): void {
  try {
    sound.pause();
    sound.currentTime = 0;
    const playback = sound.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => { /* SFX must never interrupt the ending */ });
  } catch { /* Ignore unavailable audio devices or browser restrictions */ }
}
classroomMusic.preload = 'none';
classroomMusic.loop = true;
classroomMusic.volume = 0;
let corridorFadeTimer: number | undefined;
let classroomMusicFadeTimer: number | undefined;
function fadeOutCorridorAudio(duration = 1400): Promise<void> {
  if (corridorFadeTimer !== undefined) window.clearInterval(corridorFadeTimer);
  if (archetypeMusicFadeTimer !== undefined) window.clearInterval(archetypeMusicFadeTimer);
  archetypeMusicFadeTimer = undefined;
  const start = performance.now();
  const musicStart = archetypeMusic.volume;
  const ambienceStart = corridorAmbience?.volume ?? 0;
  return new Promise((resolve) => {
    corridorFadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      const gain = 1 - progress;
      archetypeMusic.volume = Math.max(0, musicStart * gain);
      if (corridorAmbience) corridorAmbience.volume = Math.max(0, ambienceStart * gain);
      if (progress >= 1) {
        if (corridorFadeTimer !== undefined) window.clearInterval(corridorFadeTimer);
        corridorFadeTimer = undefined;
        archetypeMusic.pause(); archetypeMusic.currentTime = 0; archetypeMusic.volume = 0.60;
        if (corridorAmbience) { corridorAmbience.pause(); corridorAmbience.currentTime = 0; corridorAmbience.volume = 0.90; }
        corridorMusicStarted = false;
        resolve();
      }
    }, 30);
  });
}
let mobileClassroomStarted = false;
let mobileClassroomWanted = false;
function startClassroomMusic(): void {
  const phone = isPhoneLayout();
  if (phone) {
    if (mobileClassroomStarted && !classroomMusic.paused) return;
    mobileClassroomStarted = true;
  }
  prepareAudio(classroomMusic);
  if (classroomMusicFadeTimer !== undefined) window.clearInterval(classroomMusicFadeTimer);
  classroomMusic.pause(); classroomMusic.currentTime = 0; classroomMusic.volume = phone ? 0.62 : 0;
  void classroomMusic.play().then(() => {
    showNowPlaying({ title: 'Aria Math', artist: 'C418', spotifyQuery: 'C418 Aria Math', mood: 'green' });
    if (phone) return;
    const start = performance.now();
    classroomMusicFadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / 600);
      classroomMusic.volume = 0.62 * progress;
      if (progress >= 1 && classroomMusicFadeTimer !== undefined) {
        window.clearInterval(classroomMusicFadeTimer); classroomMusicFadeTimer = undefined;
      }
    }, 35);
  }).catch((error) => { mobileClassroomStarted = false; console.warn('Classroom music could not start:', error); });
}
function stopClassroomMusic(): void {
  mobileClassroomStarted = false; mobileClassroomWanted = false;
  hideNowPlaying();
  if (classroomMusicFadeTimer !== undefined) window.clearInterval(classroomMusicFadeTimer);
  classroomMusicFadeTimer = undefined;
  classroomMusic.pause(); classroomMusic.currentTime = 0; classroomMusic.volume = 0;
}
// Keep compatibility with external exam controllers and stop the classroom score
// when this build reaches its actual final-scene event.
window.addEventListener('game:exam-ended', stopClassroomMusic);
window.addEventListener('game:exam-scene-finished', stopClassroomMusic);
const ARCHETYPE_TRACKS: Record<string, string> = {
  'ОТЛИЧНИК': '/audio/archetypes/archetype-excellent.mp3',
  'ОТЛИЧНИЦА': '/audio/archetypes/archetype-excellent.mp3',
  'ТРИКСТЕР': '/audio/archetypes/archetype-trickster.mp3',
  'РАЙАН ГОСЛИНГ': '/audio/archetypes/archetype-gosling.mp3',
  'МЕГАН ФОКС': '/audio/archetypes/archetype-gosling.mp3',
  'АНАЛИТИК': '/audio/archetypes/archetype-analyst.mp3',
  'СМЕЛЬЧАК': '/audio/archetypes/archetype-bold.mp3',
  'СМЕЛАЯ': '/audio/archetypes/archetype-bold.mp3',
  'НАБЛЮДАТЕЛЬ': '/audio/archetypes/archetype-observer.mp3',
  'НАБЛЮДАТЕЛЬНИЦА': '/audio/archetypes/archetype-observer.mp3',
  'УНИВЕРСАЛ': '/audio/archetypes/archetype-universal.mp3'
};
let toastTimeout: number | undefined;
let isTransitioning = false;
let musicFadeTimer: number | undefined;
const SKILLS_KEY = 'last-exam-player-skills';
type SkillKey = 'knowledge' | 'logic' | 'charisma' | 'cunning' | 'confidence' | 'attention';
const skillKeys: SkillKey[] = ['knowledge','logic','charisma','cunning','confidence','attention'];
let skills: Record<SkillKey,number> = loadSkills();
function loadSkills(): Record<SkillKey,number> {
  const empty: Record<SkillKey,number> = {knowledge:0,logic:0,charisma:0,cunning:0,confidence:0,attention:0};
  try { const raw=gameStorage.getItem(SKILLS_KEY); if(raw){ const parsed=JSON.parse(raw); const out={...empty}; skillKeys.forEach(k=>out[k]=Math.max(0,Math.min(4,Number(parsed[k])||0))); if(Object.values(out).reduce((a,b)=>a+b,0)<=10) return out; } } catch {}
  return empty;
}
function totalSkills(): number { return skillKeys.reduce((sum,key)=>sum+skills[key],0); }
type ArchetypeInfo = {name:string;description:string;bonus:string;icon:string};
// Once the player enters the corridor, their archetype is locked for the whole run.
// Exam answers may change skill values, but must not change the selected archetype.
let lockedArchetype: ArchetypeInfo | null = null;
function getArchetype(): ArchetypeInfo {
 if (lockedArchetype) return lockedArchetype;
 return calculateArchetype();
}
function calculateArchetype(): ArchetypeInfo {
 const pairs = [
  {name:selection.gender==='female'?'ОТЛИЧНИЦА':'ОТЛИЧНИК',keys:['knowledge','logic'] as SkillKey[],description:selection.gender==='female'?'Опираешься на знания и стараешься разобраться во всём до мелочей.':'Опираешься на знания и стремишься разобраться во всём до мелочей.',bonus:'Преимущество в учебных вопросах и логических задачах.',icon:'▤'},
  {name:'ТРИКСТЕР',keys:['cunning','charisma'] as SkillKey[],description:selection.gender==='female'?'Ищешь нестандартные пути, умеешь договариваться и находить выход даже из сложной ситуации.':'Ищешь нестандартные пути, умеешь договариваться и выкручиваться.',bonus:'Больше возможностей для уловок и рискованных решений.',icon:'♟'},
  {name:selection.gender==='female'?'МЕГАН ФОКС':'РАЙАН ГОСЛИНГ',keys:['charisma','confidence'] as SkillKey[],description:selection.gender==='female'?'Спокойна, харизматична и уверена в себе даже в напряжённый момент.':'Спокоен, харизматичен и уверен в себе даже в напряжённый момент.',bonus:'Сильнее в социальных сценах и уверенных ответах.',icon:'★'},
  {name:'АНАЛИТИК',keys:['logic','attention'] as SkillKey[],description:'Замечаешь закономерности, сопоставляешь факты и читаешь между строк.',bonus:'Легче находить подсказки и исключать неверные варианты.',icon:'Σ'},
  {name:selection.gender==='female'?'СМЕЛАЯ':'СМЕЛЬЧАК',keys:['confidence','cunning'] as SkillKey[],description:selection.gender==='female'?'Не боишься рисковать и предпочитаешь действовать решительно.':'Не боишься рисковать и предпочитаешь действовать решительно.',bonus:'Больше вариантов для смелых и рискованных действий.',icon:'⚑'},
  {name:selection.gender==='female'?'НАБЛЮДАТЕЛЬНИЦА':'НАБЛЮДАТЕЛЬ',keys:['attention','knowledge'] as SkillKey[],description:selection.gender==='female'?'Подмечаешь детали, запоминаешь мелочи и замечаешь то, что другие пропускают.':'Подмечаешь детали, запоминаешь мелочи и замечаешь то, что другие пропускают.',bonus:'Выше шанс заметить скрытые детали и подсказки.',icon:'⌕'}
 ];
 let best=pairs[0], bestScore=-1; for(const pair of pairs){const score=skills[pair.keys[0]]+skills[pair.keys[1]];if(score>bestScore){best=pair;bestScore=score;}}
 if(bestScore<6) return {name:'УНИВЕРСАЛ',description:selection.gender==='female'?'Ты развиваешься сразу в нескольких направлениях и готова подстроиться под ситуацию.':'Ты развиваешься сразу в нескольких направлениях и готов подстроиться под ситуацию.',bonus:'Нет узкой специализации — твой стиль зависит от распределения навыков.',icon:'✦'};
 return best;
}
function renderSkills(): void {
 const remaining=10-totalSkills(); if(pointsLeft) pointsLeft.textContent=String(remaining);
 document.querySelectorAll<HTMLElement>('.skill-card').forEach(card=>{const key=card.dataset.skill as SkillKey;const value=skills[key]||0;const meter=card.querySelector<HTMLElement>('.skill-meter');if(meter)meter.innerHTML=Array.from({length:4},(_,i)=>`<i class="${i<value?'filled':''}" aria-hidden="true"></i>`).join('');const count=card.querySelector<HTMLElement>('.skill-actions strong');if(count)count.textContent=String(value);const minus=card.querySelector<HTMLButtonElement>('[data-delta="-1"]');const plus=card.querySelector<HTMLButtonElement>('[data-delta="1"]');if(minus)minus.disabled=value<=0;if(plus)plus.disabled=value>=4||remaining<=0;});
 const a=getArchetype();if(archetypeName)archetypeName.textContent=a.name;if(archetypeDescription)archetypeDescription.textContent=a.description;if(archetypeBonus)archetypeBonus.textContent=a.bonus;if(archetypeEmblem)archetypeEmblem.textContent=a.icon;if(skillsStatus)skillsStatus.textContent=remaining===0?'Все очки распределены!':`Осталось распределить: ${remaining}`;if(skillsWarning)skillsWarning.textContent=remaining===0?'✓  Все очки распределены — можно продолжать':'ⓘ  Все очки нужно распределить до подтверждения';if(skillsContinue)skillsContinue.disabled=remaining!==0;gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills));
}


function renderTicket(): void {
  try {
    const player = JSON.parse(gameStorage.getItem('last-exam-player-data') || '{}');
    const set = (id: string, value: string) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('ticket-surname', player.surname || 'Фамилия'); set('ticket-name', player.givenName || 'Имя'); set('ticket-group', player.group || 'Группа');
    const archetype=getArchetype(); set('ticket-archetype-name', archetype.name); set('ticket-archetype-description', archetype.description);
    set('ticket-archetype-icon', '');
    const photo=document.getElementById('ticket-photo') as HTMLImageElement | null;
    if(photo){ photo.src = selection.gender==='female' ? `/assets/characters/student_girl${selection.femalePreset+1}/card.webp` : (selection.malePreset === SECRET_MALE_PRESET ? '/assets/characters/student_male6/card.webp' : selection.malePreset === DEVIL_MALE_PRESET ? '/assets/characters/student_male7/card.webp' : `/assets/characters/student_boy${selection.malePreset+1}/card.webp`); photo.onerror=()=>{photo.onerror=null;photo.src='/assets/character_selector_male.webp';}; }
  } catch { /* retain the ticket's safe placeholder labels */ }
}

// Start audio directly inside the user's click gesture so mobile browsers allow playback.
async function startIntroMusic(): Promise<void> {
  if (!introMusic) return;
  if (musicFadeTimer !== undefined) {
    window.clearInterval(musicFadeTimer);
    musicFadeTimer = undefined;
  }
  introMusic.loop = true;
  introMusic.volume = 0.75;
  if (introMusic.ended) introMusic.currentTime = 0;
  try {
    await introMusic.play();
  } catch (error) {
    // Keep the game usable if the browser or device blocks audio playback.
    console.warn('Intro music could not start:', error);
  }
}

function fadeOutIntroMusic(duration = 1600): void {
  if (!introMusic || introMusic.paused) return;
  if (musicFadeTimer !== undefined) window.clearInterval(musicFadeTimer);
  const startingVolume = introMusic.volume;
  const startedAt = performance.now();
  musicFadeTimer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / duration);
    introMusic.volume = Math.max(0, startingVolume * (1 - progress));
    if (progress >= 1) {
      if (musicFadeTimer !== undefined) window.clearInterval(musicFadeTimer);
      musicFadeTimer = undefined;
      introMusic.pause();
      introMusic.currentTime = 0;
      introMusic.volume = 0.75;
    }
  }, 40);
}

function corridorTrack(): string {
  const archetypeName = getArchetype().name.toLocaleUpperCase('ru-RU');
  return isDevilPresetSelected() ? '/audio/easter-eggs/devil-corridor.mp3' : isSecretPresetSelected() ? '/audio/easter-eggs/welcome-to-san-andreas.mp3' : (ARCHETYPE_TRACKS[archetypeName] ?? ARCHETYPE_TRACKS['УНИВЕРСАЛ']);
}
function prepareFriend(): void {
  if (preparedFriendFor !== selectedCharacterKey()) {
    corridorFriend = chooseCorridorFriend();
    preparedFriendFor = selectedCharacterKey();
  }
}
function prepareCorridor(): void {
  prepareFriend();
  const key = selectedCharacterKey();
  const track = corridorTrack();
  const firstImages = [...corridorAssets, selectedSpritePath('thinking'), `/assets/characters/${corridorFriend.folder}/thinking.webp`];
  // Promote entry assets out of the speculative queue. Start the future audio only
  // after the entry artwork, so a large track cannot starve the first scene's images.
  void Promise.all(firstImages.map(source => loadImage(source))).then(() => {
    if (selectedCharacterKey() !== key || corridorTrack() !== track) return;
    warmSelectedEmotions();
    warmImages(emotionNames.map(emotion => `/assets/characters/${corridorFriend.folder}/${emotion}.webp`));
    prepareAudio(archetypeMusic, track);
    prepareAudio(corridorAmbience);
    prepareClassroom();
  });
}
function prepareClassroom(): void {
  // Called while the player is still reading corridor dialogue.
  void Promise.all(classroomAssets.map(source => loadImage(source))).then(() => {
    prepareAudio(classroomMusic);
    prepareAudio(classroomDoorSound);
  });
}
function startArchetypeMusic(): void {
  if (corridorMusicStarted) return;
  const track = corridorTrack();
  corridorMusicStarted = true;
  if (archetypeMusicFadeTimer !== undefined) window.clearInterval(archetypeMusicFadeTimer);
  archetypeMusic.pause();
  prepareAudio(archetypeMusic, track);
  archetypeMusic.currentTime = 0;
  const nowPlayingByPath: Record<string, NowPlayingTrack> = {
    '/audio/archetypes/archetype-excellent.mp3': { title: 'RV 269 «Весна»: I. Allegro', artist: 'Антонио Вивальди', spotifyQuery: 'Antonio Vivaldi RV 269 Spring I Allegro', yandexUrl: 'https://music.yandex.ru/album/10846125/track/66491628?ref_id=6255D249-7199-4C4B-96FA-D5D8C09E5DE7&utm_medium=share_link_tg&utm_source=mobile_ios', mood: 'yellow', cover: '/assets/music-covers/vivaldi.webp' },
    '/audio/archetypes/archetype-trickster.mp3': { title: 'Vermilion', artist: 'Slipknot', spotifyQuery: 'Slipknot Vermilion', mood: 'red', cover: '/assets/music-covers/vermilion.webp' },
    '/audio/archetypes/archetype-gosling.mp3': { title: 'Nightcall', artist: 'Kavinsky', spotifyQuery: 'Kavinsky Nightcall', mood: 'blue', cover: '/assets/music-covers/nightcall.webp' },
    '/audio/archetypes/archetype-analyst.mp3': { title: 'Take A Look Around', artist: 'Limp Bizkit', spotifyQuery: 'Limp Bizkit Take A Look Around', mood: 'red', cover: '/assets/music-covers/take-a-look-around.webp' },
    '/audio/archetypes/archetype-bold.mp3': { title: "Rollin'", artist: 'Limp Bizkit', spotifyQuery: 'Limp Bizkit Rollin', mood: 'red', cover: '/assets/music-covers/rollin.webp' },
    '/audio/archetypes/archetype-observer.mp3': { title: 'Спокойная ночь', artist: 'Кино', spotifyQuery: 'Кино Спокойная ночь', mood: 'red', cover: '/assets/music-covers/spokoynaya-noch.webp' },
    '/audio/archetypes/archetype-universal.mp3': { title: 'Sometimes', artist: 'Mattyeux', spotifyQuery: 'Mattyeux Sometimes', mood: 'blue', cover: '/assets/music-covers/sometimes.webp' },
    '/audio/easter-eggs/devil-corridor.mp3': { title: 'Eyeless', artist: 'Slipknot', spotifyQuery: 'Slipknot Eyeless', mood: 'red', cover: '/assets/music-covers/eyeless.webp' },
    '/audio/easter-eggs/welcome-to-san-andreas.mp3': { title: 'Welcome to San Andreas', artist: 'Young Maylay', spotifyQuery: 'Young Maylay Welcome to San Andreas', mood: 'green', cover: '/assets/music-covers/hesoyam.webp' }
  };
  const currentTrackInfo = nowPlayingByPath[track] ?? { title: 'Corridor Theme', artist: 'Последний зачёт • OST', spotifyQuery: 'video game corridor soundtrack' };
  archetypeMusic.loop = true;
  archetypeMusic.volume = 0;
  if (corridorAmbience) {
    corridorAmbience.pause();
    corridorAmbience.currentTime = 0;
    corridorAmbience.loop = true;
    corridorAmbience.volume = 0;
    void corridorAmbience.play().then(() => {
      const ambienceStartedAt = performance.now();
      const ambienceFadeTimer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - ambienceStartedAt) / 500);
        if (corridorAmbience) corridorAmbience.volume = 0.90 * progress;
        if (progress >= 1) window.clearInterval(ambienceFadeTimer);
      }, 40);
    }).catch((error) => console.warn('Corridor ambience could not start:', error));
  }
  // Called directly from the "Начать игру" click so mobile browsers permit playback.
  void archetypeMusic.play().then(() => {
    showNowPlaying(currentTrackInfo);
    const startedAt = performance.now();
    const targetVolume = 0.60;
    archetypeMusicFadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / 500);
      archetypeMusic.volume = targetVolume * progress;
      if (progress >= 1 && archetypeMusicFadeTimer !== undefined) {
        window.clearInterval(archetypeMusicFadeTimer);
        archetypeMusicFadeTimer = undefined;
      }
    }, 40);
  }).catch((error) => {
    corridorMusicStarted = false;
    console.warn('Archetype music could not start:', error);
  });
}

// The first-scene screen will dispatch this event when it is connected.
window.addEventListener('game:first-scene-start', () => {
  fadeOutIntroMusic();
});

window.addEventListener('game:scene-change', (event) => {
  const detail = (event as CustomEvent<{ scene?: string }>).detail;
  if (detail?.scene && detail.scene !== 'corridor' && detail.scene !== 'first' && detail.scene !== 'first-scene') {
    void fadeOutCorridorAudio();
  }
});
// Dialogue bridge for scene scripts: dispatch game:dialogue-line with { emotion, targetId?, maleText?, femaleText? }.
// It switches the selected character's sprite and chooses the correct gender-specific Russian wording.
window.addEventListener('game:dialogue-line', (event) => {
  const detail = (event as CustomEvent<{ emotion?: string; targetId?: string; maleText?: string; femaleText?: string }>).detail;
  if (!detail) return;
  if (detail.emotion) applyCharacterEmotion(detail.emotion);
  if (detail.targetId) renderGenderedDialogue(detail);
});
window.addEventListener('game:character-selected', () => applyCharacterEmotion('normal'));
window.addEventListener('game:scene-change', () => applyCharacterEmotion('normal'));
window.addEventListener('game:scene-change', (event) => {
  const detail = (event as CustomEvent<{ scene?: string }>).detail;
  if (detail?.scene === 'first' || detail?.scene === 'first-scene') fadeOutIntroMusic();
});

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function saveSelection(): void {
  gameStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
}
function showScreen(screen: 'start' | 'character' | 'input' | 'skills' | 'ticket' | 'corridor' | 'classroom-intro' | 'classroom-gallery' | 'classroom-classmates' | 'teacher-intro' | 'exam'): void {
  if (screen === 'start') syncMenuAchievementsButton();
  if (screen !== 'character') stopCharacterLoading();
  const showStart = screen === 'start';
  const showCharacter = screen === 'character';
  const showInput = screen === 'input';
  const showSkills = screen === 'skills';
  const showTicket = screen === 'ticket';
  const showCorridor = screen === 'corridor';
  const showClassroomIntro = screen === 'classroom-intro';
  const showClassroomGallery = screen === 'classroom-gallery';
  const showClassroomClassmates = screen === 'classroom-classmates';
  const showTeacherIntro = screen === 'teacher-intro';
  const showExam = screen === 'exam';
  startScreen?.classList.toggle('is-hidden', !showStart);
  characterScreen?.classList.toggle('is-hidden', !showCharacter);
  inputScreen?.classList.toggle('is-hidden', !showInput);
  skillsScreen?.classList.toggle('is-hidden', !showSkills);
  ticketScreen?.classList.toggle('is-hidden', !showTicket);
  document.getElementById('corridor-screen')?.classList.toggle('is-hidden', !showCorridor);
  document.getElementById('classroom-intro-screen')?.classList.toggle('is-hidden', !showClassroomIntro);
  document.getElementById('classroom-gallery-screen')?.classList.toggle('is-hidden', !showClassroomGallery);
  document.getElementById('classroom-classmates-screen')?.classList.toggle('is-hidden', !showClassroomClassmates);
  document.getElementById('teacher-intro-screen')?.classList.toggle('is-hidden', !showTeacherIntro);
  document.getElementById('exam-screen')?.classList.toggle('is-hidden', !showExam);
  startScreen?.setAttribute('aria-hidden', String(!showStart));
  characterScreen?.setAttribute('aria-hidden', String(!showCharacter));
  inputScreen?.setAttribute('aria-hidden', String(!showInput));
  skillsScreen?.setAttribute('aria-hidden', String(!showSkills));
  ticketScreen?.setAttribute('aria-hidden', String(!showTicket));
  document.getElementById('corridor-screen')?.setAttribute('aria-hidden', String(!showCorridor));
  document.getElementById('classroom-intro-screen')?.setAttribute('aria-hidden', String(!showClassroomIntro));
  document.getElementById('classroom-gallery-screen')?.setAttribute('aria-hidden', String(!showClassroomGallery));
  document.getElementById('classroom-classmates-screen')?.setAttribute('aria-hidden', String(!showClassroomClassmates));
  document.getElementById('teacher-intro-screen')?.setAttribute('aria-hidden', String(!showTeacherIntro));
  document.getElementById('exam-screen')?.setAttribute('aria-hidden', String(!showExam));
  if (showCharacter) {
    hideNowPlaying(); renderSelection();
    warmImages(['/assets/input_screen_background.webp', '/assets/notebook_form_transparent.webp']);
  }
  if (showInput) {
    // Prepare the first playable scene before speculative alternate emotions.
    prepareFriend();
    warmImages([...corridorAssets, selectedSpritePath('thinking'), `/assets/characters/${corridorFriend.folder}/thinking.webp`, ...classroomAssets, '/assets/student-ticket.webp']);
    warmImages(['smile', 'confident', 'worried', 'normal'].flatMap(emotion => [selectedSpritePath(emotion as CharacterEmotion), `/assets/characters/${corridorFriend.folder}/${emotion}.webp`]));
  }
  if (showSkills) { renderSkills(); void prepareDisclaimer(); prepareMedia(document.getElementById('intro-video') as HTMLVideoElement | null); }
  if (showTicket) { renderTicket(); prepareCorridor(); void prepareDisclaimer(); prepareMedia(document.getElementById('intro-video') as HTMLVideoElement | null); }
}
let selectionRenderVersion = 0;
function renderSelection(): void {
  syncSecretIdentity();
  applyCharacterEmotion(activeEmotion);
  const version = ++selectionRenderVersion;
  if (characterScreen && !characterScreen.classList.contains('is-hidden')) {
    const finishLoading = beginCharacterLoading();
    characterScreen.setAttribute('aria-busy', 'true');
    void loadImage(selectedSpritePath(activeEmotion)).then(loaded => {
      finishLoading();
      if (version !== selectionRenderVersion) return;
      characterScreen.removeAttribute('aria-busy');
      if (!loaded) { showToast('Не удалось загрузить персонажа. Выберите его ещё раз.'); return; }
      maleBoySprites.forEach((sprite, index) => {
        const visible = selection.gender === 'male' && selection.malePreset === index && (index !== SECRET_MALE_PRESET || secretPresetUnlocked) && (index !== DEVIL_MALE_PRESET || devilPresetUnlocked);
        sprite?.classList.toggle('is-visible', visible);
        sprite?.setAttribute('aria-hidden', String(!visible));
      });
      const showGirl1 = selection.gender === 'female' && selection.femalePreset === 0;
      const showGirl2 = selection.gender === 'female' && selection.femalePreset === 1;
      const showGirl3 = selection.gender === 'female' && selection.femalePreset === 2;
      const showGirl4 = selection.gender === 'female' && selection.femalePreset === 3;
      const showGirl5 = selection.gender === 'female' && selection.femalePreset === 4;
      femaleGirl1Sprite?.classList.toggle('is-visible', showGirl1);
      femaleGirl1Sprite?.setAttribute('aria-hidden', String(!showGirl1));
      femaleGirl2Sprite?.classList.toggle('is-visible', showGirl2);
      femaleGirl2Sprite?.setAttribute('aria-hidden', String(!showGirl2));
      femaleGirl3Sprite?.classList.toggle('is-visible', showGirl3);
      femaleGirl3Sprite?.setAttribute('aria-hidden', String(!showGirl3));
      femaleGirl4Sprite?.classList.toggle('is-visible', showGirl4);
      femaleGirl4Sprite?.setAttribute('aria-hidden', String(!showGirl4));
      femaleGirl5Sprite?.classList.toggle('is-visible', showGirl5);
      femaleGirl5Sprite?.setAttribute('aria-hidden', String(!showGirl5));
    });
  }
  document.querySelectorAll<HTMLElement>('.selector-panel').forEach((panel) => {
    const gender = panel.dataset.gender as Gender;
    const active = selection.gender === gender;
    panel.classList.toggle('is-active', active);
    panel.classList.toggle('is-dimmed', !active);
    const selectedIndex = gender === 'male' ? selection.malePreset : selection.femalePreset;
    panel.querySelectorAll<HTMLButtonElement>('.portrait-slot').forEach((slot) => {
      const isSecretSlot = slot.dataset.secret === 'cj';
      const isDevilSlot = slot.dataset.secret === 'devil';
      slot.classList.toggle('is-hidden', (isSecretSlot && !secretPresetUnlocked) || (isDevilSlot && !devilPresetUnlocked));
      slot.setAttribute('aria-hidden', String((isSecretSlot && !secretPresetUnlocked) || (isDevilSlot && !devilPresetUnlocked)));
      const selected = Number(slot.dataset.index) === selectedIndex;
      slot.classList.toggle('is-selected', selected);
      slot.setAttribute('aria-pressed', String(selected && active));
    });
  });
}
function activateGender(gender: Gender): void {
  selection.gender = gender;
  saveSelection();
  renderSelection();
}
function setPreset(gender: Gender, index: number): void {
  selection.gender = gender;
  if (gender === 'male') selection.malePreset = index === SECRET_MALE_PRESET && !secretPresetUnlocked ? 2 : index === DEVIL_MALE_PRESET && !devilPresetUnlocked ? 1 : Math.min(index, DEVIL_MALE_PRESET);
  else selection.femalePreset = index;
  saveSelection();
  syncSecretIdentity();
  renderSelection();
}
function changePreset(gender: Gender, direction: -1 | 1): void {
  const current = gender === 'male' ? selection.malePreset : selection.femalePreset;
  if (gender === 'male') {
    const allowed = [0, 1, 2, 3, 4];
    if (secretPresetUnlocked) allowed.push(SECRET_MALE_PRESET);
    if (devilPresetUnlocked) allowed.push(DEVIL_MALE_PRESET);
    const at = Math.max(0, allowed.indexOf(current));
    setPreset(gender, allowed[(at + direction + allowed.length) % allowed.length]);
  } else {
    const count = 5;
    setPreset(gender, (current + direction + count) % count);
  }
}
function showToast(message: string): void {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  if (toastTimeout !== undefined) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

const warmSelection = () => warmImages([...selectionAssets, selectedSpritePath()]);
const menuAchievementsButton = document.getElementById('start-achievements-button');
const warmAchievements = () => warmImages(achievementAssets);
menuAchievementsButton?.addEventListener('pointerenter', warmAchievements);
menuAchievementsButton?.addEventListener('focus', warmAchievements);
menuAchievementsButton?.addEventListener('touchstart', warmAchievements, { passive: true });
menuAchievementsButton?.addEventListener('click', () => { void showAchievementsPage('menu'); });
startButton?.addEventListener('pointerenter', warmSelection);
startButton?.addEventListener('focus', warmSelection);
startButton?.addEventListener('touchstart', warmSelection, { passive: true });

startButton?.addEventListener('click', async () => {
  if (isTransitioning) return;
  // Must be called before awaiting the screen transition: this click is the browser's user gesture.
  void startIntroMusic();
  isTransitioning = true;
  startButton.disabled = true;

  const finishLoading = beginCharacterLoading();
  void Promise.all([...selectionAssets, selectedSpritePath()].map(source => loadImage(source))).finally(finishLoading);
  await transitionScene(() => showScreen('character'), [...selectionAssets, selectedSpritePath()]);

  startButton.disabled = false;
  isTransitioning = false;
});

continueButton?.addEventListener('click', async () => {
  if (isTransitioning) return;
  saveSelection();
  window.dispatchEvent(new CustomEvent('game:character-selected', { detail: { ...selection } }));
  isTransitioning = true;
  await transitionScene(() => { showScreen('input'); syncSecretIdentity(); }, ['/assets/input_screen_background.webp', '/assets/notebook_form_transparent.webp']);
  isTransitioning = false;
});

inputBackButton?.addEventListener('click', async () => {
  if (isTransitioning) return;
  isTransitioning = true;
  await transitionScene(() => showScreen('character'), [...selectionAssets, selectedSpritePath()]);
  isTransitioning = false;
});

skillsBack?.addEventListener('click', async () => { if(isTransitioning)return; isTransitioning=true; try { await transitionScene(() => showScreen('input')); } finally { isTransitioning=false; } });
document.querySelectorAll<HTMLElement>('.skill-card').forEach(card=>{
 const key=card.dataset.skill as SkillKey;
 card.querySelectorAll<HTMLButtonElement>('[data-delta]').forEach(button=>button.addEventListener('click',()=>{const delta=Number(button.dataset.delta)||0;if(delta>0&&(skills[key]>=4||totalSkills()>=10))return;skills[key]=Math.max(0,Math.min(4,skills[key]+delta));renderSkills();}));
});
skillsContinue?.addEventListener('click', async () => { if(skillsContinue.disabled || isTransitioning)return; gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills)); window.dispatchEvent(new CustomEvent('game:skills-confirmed',{detail:{...skills,archetype:getArchetype().name}})); isTransitioning=true; try { await transitionScene(() => showScreen('ticket'), ['/assets/student-ticket.webp']); } finally { isTransitioning=false; } });

playerForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!playerForm.reportValidity()) return;
  const formData = new FormData(playerForm);
  const player = {
    surname: isSecretPresetSelected() ? 'Джонсон' : String(formData.get('surname') ?? '').trim(),
    givenName: isSecretPresetSelected() ? 'Карл' : String(formData.get('givenName') ?? '').trim(),
    group: String(formData.get('group') ?? '').trim(),
  };
  if (!player.surname || !player.givenName || !player.group) return;
  gameStorage.setItem('last-exam-player-data', JSON.stringify(player));
  window.dispatchEvent(new CustomEvent('game:player-data-entered', { detail: player }));
  if (inputToast) { inputToast.textContent = 'Данные сохранены!'; inputToast.classList.add('is-visible'); window.setTimeout(() => inputToast.classList.remove('is-visible'), 1200); }
  if (!isTransitioning) { isTransitioning=true; void transitionScene(() => showScreen('skills')).finally(() => { isTransitioning=false; }); }
});

document.addEventListener('keydown', (event) => {
  if (!characterScreen || characterScreen.classList.contains('is-hidden')) { cheatBuffer = ''; return; }
  if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
  cheatBuffer = (cheatBuffer + event.key.toLowerCase()).slice(-7);
  const code = cheatBuffer.endsWith('hesoyam') ? 'hesoyam' : cheatBuffer.endsWith('devil') ? 'devil' : '';
  if (!code) return;
  cheatBuffer = '';
  if (code === 'hesoyam') {
    if (secretPresetUnlocked) {
      secretPresetUnlocked = false;
      gameStorage.setItem(SECRET_UNLOCK_KEY, 'false');
      if (selection.gender === 'male' && selection.malePreset === SECRET_MALE_PRESET) {
        selection.malePreset = 2;
        saveSelection();
        syncSecretIdentity();
      }
      showToast('HESOYAM отключён! Си-Джей скрыт.');
    } else {
      secretPresetUnlocked = true;
      unlockAchievement('hesoyam');
      gameStorage.setItem(SECRET_UNLOCK_KEY, 'true');
      showToast('HESOYAM активирован! Си-Джей разблокирован.');
    }
    playUiSound(cheatActivationSound);
  } else {
    if (devilPresetUnlocked) {
      devilPresetUnlocked = false;
      gameStorage.setItem(DEVIL_UNLOCK_KEY, 'false');
      if (selection.gender === 'male' && selection.malePreset === DEVIL_MALE_PRESET) {
        selection.malePreset = 1;
        saveSelection();
        syncSecretIdentity();
      }
      showToast('DEVIL отключён! Мик Томпсон скрыт.');
    } else {
      devilPresetUnlocked = true;
      gameStorage.setItem(DEVIL_UNLOCK_KEY, 'true');
      showToast('DEVIL активирован! Мик Томпсон разблокирован.');
    }
    playUiSound(devilActivationSound);
  }
  characterScreen.classList.remove('hesoyam-scene-shake');
  characterScreen.classList.remove('devil-scene-shake');
  void characterScreen.offsetWidth;
  characterScreen.classList.add(code === 'devil' ? 'devil-scene-shake' : 'hesoyam-scene-shake');
  window.setTimeout(() => {
    characterScreen?.classList.remove('hesoyam-scene-shake');
    characterScreen?.classList.remove('devil-scene-shake');
  }, 620);
  renderSelection();
});

document.querySelectorAll<HTMLElement>('.selector-panel').forEach((panel) => {
  const gender = panel.dataset.gender as Gender;
  panel.querySelector<HTMLButtonElement>('.panel-hit')?.addEventListener('click', () => activateGender(gender));
  panel.querySelector<HTMLButtonElement>('.arrow-left')?.addEventListener('click', (event) => {
    event.stopPropagation();
    changePreset(gender, -1);
  });
  panel.querySelector<HTMLButtonElement>('.arrow-right')?.addEventListener('click', (event) => {
    event.stopPropagation();
    changePreset(gender, 1);
  });
  panel.querySelectorAll<HTMLButtonElement>('.portrait-slot').forEach((slot) => {
    const warmPortrait = () => {
      if (slot.classList.contains('is-hidden')) return;
      const index = Number(slot.dataset.index);
      const folder = gender === 'female' ? `student_girl${index + 1}` : index === 5 ? 'student_male6' : index === 6 ? 'student_male7' : `student_boy${index + 1}`;
      warmImages([`/assets/characters/${folder}/normal.webp`]);
    };
    slot.addEventListener('pointerenter', warmPortrait);
    slot.addEventListener('focus', warmPortrait);
    slot.addEventListener('touchstart', warmPortrait, { passive: true });
    slot.addEventListener('click', (event) => {
      event.stopPropagation();
      setPreset(gender, Number(slot.dataset.index));
    });
  });
});

document.getElementById('ticket-back')?.addEventListener('click', async () => { if(isTransitioning)return; isTransitioning=true; try { await transitionScene(() => showScreen('skills')); } finally { isTransitioning=false; } });
let introVideoInProgress = false;
let introVideoFinished = false;
let introVideoShown = false;
let disclaimerPreparation: Promise<boolean> | null = null;
let disclaimerArtworkReady = false;
function prepareDisclaimer(): Promise<boolean> {
  if (disclaimerPreparation) return disclaimerPreparation;
  const image = document.querySelector<HTMLImageElement>('#disclaimer-overlay .disclaimer-image');
  if (!image) return Promise.resolve(false);
  image.loading = 'eager';
  if (image.complete && !image.naturalWidth) image.src = image.src;
  disclaimerPreparation = image.decode().then(() => {
    disclaimerArtworkReady = true;
    return true;
  }, () => {
    disclaimerArtworkReady = false;
    disclaimerPreparation = null; // Retry on a later visit to skills/ticket.
    return false;
  });
  return disclaimerPreparation;
}

function finishIntroVideoAndEnterCorridor(): void {
  if (introVideoFinished) return;
  introVideoFinished = true;
  introVideoShown = false;
  introVideoInProgress = false;
  const video = document.getElementById('intro-video') as HTMLVideoElement | null;
  if (video) {
    video.pause();
    // A paused video may keep downloading megabytes after Skip. Abort that fetch;
    // the <source> remains available for the next replay's user-initiated play().
    video.preload = 'none';
    video.load();
  }
  window.dispatchEvent(new CustomEvent('game:start-requested',{detail:{selection,skills,archetype:getArchetype().name,scene:'first-scene'}}));
  void beginCorridorScene();
}

function playIntroVideoBeforeCorridor(): void {
  if (introVideoInProgress || introVideoFinished) return;
  const disclaimer = document.getElementById('disclaimer-overlay');
  const overlay = document.getElementById('intro-video-overlay');
  const video = document.getElementById('intro-video') as HTMLVideoElement | null;
  if (!overlay || !video || !disclaimer) {
    finishIntroVideoAndEnterCorridor();
    return;
  }

  introVideoInProgress = true;
  introVideoShown = false;
  void prepareDisclaimer();
  disclaimer.classList.toggle('has-artwork', disclaimerArtworkReady);
  prepareCorridor();
  disclaimer.classList.remove('is-hidden');
  disclaimer.setAttribute('aria-hidden', 'false');
  hideNowPlaying();
  fadeOutIntroMusic(650);

  // Prime video playback directly inside the user's click gesture. Browsers may reject
  // audible autoplay when play() is first called from the timer four seconds later.
  video.pause();
  video.currentTime = 0;
  video.muted = false;
  const audioUnlock = video.play();
  if (audioUnlock && typeof audioUnlock.then === 'function') {
    void audioUnlock.then(() => {
      // A delayed first play() may resolve after the disclaimer or after Skip.
      // Never pause/reset the real playback when that happens.
      if (introVideoFinished || !introVideoInProgress || disclaimer.classList.contains('is-hidden')) return;
      video.pause();
      video.currentTime = 0;
      video.muted = false;
    }).catch(() => {
      // Do not silently switch to muted playback; the real playback attempt below
      // will retain audio and the browser can report if a user gesture is required.
    });
  } else {
    video.pause();
  }

  // The disclaimer has no controls and automatically advances to the intro after 4 seconds.
  requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(() => {
    if (introVideoFinished || !introVideoInProgress) return;
    introVideoShown = true;
    disclaimer.classList.add('is-hidden');
    disclaimer.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('aria-hidden', 'false');
    video.currentTime = 0;
    video.muted = false;
    const playback = video.play();
    if (playback && typeof playback.catch === 'function') {
      void playback.catch(() => {
        // Never mute the intro as a fallback: keep the original soundtrack enabled.
        // If the browser blocks playback, allow the player to retry from the video control.
        video.controls = true;
      });
    }
  }, 4000)));
}

document.getElementById('ticket-start')?.addEventListener('click',()=>{
  if (introVideoInProgress || introVideoFinished) return;
  const el=document.getElementById('ticket-start'); if(el){el.classList.add('is-confirmed');window.setTimeout(()=>el.classList.remove('is-confirmed'),500);}
  playIntroVideoBeforeCorridor();
});
document.getElementById('intro-video')?.addEventListener('ended', () => { if (introVideoShown) finishIntroVideoAndEnterCorridor(); });
document.getElementById('intro-video-skip')?.addEventListener('click', finishIntroVideoAndEnterCorridor);

// First narrative scene: the corridor dialogue follows the approved scenario branches.
type CorridorBeat = { text: string; emotion: CharacterEmotion };
let corridorBeats: CorridorBeat[] = [];
let corridorIndex = 0;
let corridorChoiceMade = false;
type FriendPreset = { key: string; gender: 'male' | 'female'; folder: string };
let preparedFriendFor: string | null = null;
let corridorFriend: FriendPreset = { key: 'female1', gender: 'female', folder: 'student_girl1' };
function chooseCorridorFriend(): FriendPreset {
  const available: FriendPreset[] = [
    { key: 'male1', gender: 'male', folder: 'student_boy1' },
    { key: 'male2', gender: 'male', folder: 'student_boy2' },
    { key: 'male3', gender: 'male', folder: 'student_boy3' },
    { key: 'male4', gender: 'male', folder: 'student_boy4' },
    { key: 'male5', gender: 'male', folder: 'student_boy5' },
    { key: 'female1', gender: 'female', folder: 'student_girl1' },
    { key: 'female2', gender: 'female', folder: 'student_girl2' },
    { key: 'female3', gender: 'female', folder: 'student_girl3' },
    { key: 'female4', gender: 'female', folder: 'student_girl4' },
    { key: 'female5', gender: 'female', folder: 'student_girl5' },
  ];
  // Exclude the exact preset chosen by the player so the companion is always distinct.
  const selectedKey = selection.gender === 'female'
    ? `female${selection.femalePreset + 1}`
    : `male${selection.malePreset + 1}`;
  const candidates = available.filter((preset) => preset.key !== selectedKey);
  const pool = candidates.length > 0 ? candidates : available;
  return pool[Math.floor(Math.random() * pool.length)];
}
let friendRenderVersion = 0;
async function showCorridorFriend(visible: boolean, emotion: CharacterEmotion = 'normal'): Promise<void> {
  const version = ++friendRenderVersion;
  const sprite = document.getElementById('corridor-friend-sprite') as HTMLImageElement | null;
  if (!sprite) return;
  if (!visible) { sprite.classList.add('is-hidden'); sprite.setAttribute('aria-hidden', 'true'); return; }
  if (visible) {
    const availableEmotions: CharacterEmotion[] = ['normal', 'confident', 'smile', 'thinking', 'worried'];
    const safeEmotion = availableEmotions.includes(emotion) ? emotion : 'normal';
    const nextSrc = `/assets/characters/${corridorFriend.folder}/${safeEmotion}.webp`;
    await swapImage(sprite, nextSrc);
    if (version !== friendRenderVersion) return;
    sprite.classList.remove('is-hidden');
    sprite.setAttribute('aria-hidden', 'false');
    sprite.alt = `${corridorFriend.gender === 'female' ? 'Подруга' : 'Друг'} персонажа: ${safeEmotion === 'normal' ? 'обычное выражение' : safeEmotion}`;
    sprite.dataset.emotion = safeEmotion;
    // Emotion changes are instant; do not restart the sprite entrance animation.
  }
}
function corridorPlayerName(): string {
  try {
    const p = JSON.parse(gameStorage.getItem('last-exam-player-data') || '{}');
    return p.givenName || p.name || p.surname || 'ИГРОК';
  } catch { return 'ИГРОК'; }
}
function corridorPlayerSurname(): string {
  try {
    const p = JSON.parse(gameStorage.getItem('last-exam-player-data') || '{}');
    return String(p.surname || 'Студент').trim();
  } catch { return 'Студент'; }
}
function corridorBranch(): CorridorBeat[] {
  const name = getArchetype().name.toLocaleUpperCase('ru-RU');
  const female = selection.gender === 'female';
  let thought = female ? 'Последний зачёт. История КИУ. Семь вопросов — и я свободна. Что вообще может пойти не так?' : 'Последний зачёт. История КИУ. Семь вопросов — и я свободен. Что вообще может пойти не так?';
  let friend = female ? 'Ну что, остался последний шаг. Ты готовилась к зачёту?' : 'Ну что, остался последний шаг. Ты готовился к зачёту?';
  let hero = 'Да как сказать… Главное — войти уверенно.';
  let closing = female ? 'Пора решать, как именно заходить. Главное — не растеряться.' : 'Пора решать, как именно заходить. Главное — не растеряться.';
  if (name.includes('ОТЛИЧНИК')) {
    thought='Последний зачёт. Если вопросы будут по программе, я справлюсь. Главное — не перепутать даты.';
    friend=female?'Ну что, опять всё выучила наизусть? Готовилась к зачёту?':'Ну что, опять всё выучил наизусть? Готовился к зачёту?';
    hero=selection.gender==='female'?'Я повторила основные даты и факты. Должно хватить.':'Я повторил основные даты и факты. Должно хватить.';
    closing=female?'Семь вопросов. Нужно спокойно применить то, что я знаю.':'Семь вопросов. Нужно спокойно применить то, что я знаю.';
  } else if (name.includes('ТРИКСТЕР')) {
    thought='Последний зачёт. План А — ответить самому. План Б… лучше пока не озвучивать.';
    friend=female?'Есть план на зачёт или будем импровизировать? Ты вообще готовилась?':'Есть план на зачёт или будем импровизировать? Ты вообще готовился?';
    hero=selection.gender==='female'?'У меня всегда найдётся запасной вариант.':'У меня всегда найдётся запасной вариант.';
    closing='Сначала посмотрим, насколько преподавательница сегодня внимательна.';
  } else if (name.includes('РАЙАН')) {
    thought=selection.gender==='female'?'Последний зачёт. Семь вопросов — и я свободна. В крайнем случае, попробую договориться.':'Последний зачёт. Семь вопросов — и я свободен. В крайнем случае, попробую договориться.';
    friend=female?'Готова очаровать комиссию своим присутствием? Ты к вопросам готовилась?':'Готов очаровать комиссию своим присутствием? Ты к вопросам готовился?';
    hero=selection.gender==='female'?'Главное — не только знать ответ, но и правильно его подать.':'Главное — не только знать ответ, но и правильно его подать.';
    closing=female?'Спокойствие, улыбка и уверенный тон. Уже неплохое начало.':'Спокойствие, улыбка и уверенный тон. Уже неплохое начало.';
  } else if (name.includes('АНАЛИТИК')) {
    thought='Последний зачёт. Семь вопросов. Если оценить варианты и не торопиться, всё должно сойтись.';
    friend=female?'Ты уже просчитала все варианты провала? А к самому зачёту готовилась?':'Ты уже просчитал все варианты провала? А к самому зачёту готовился?';
    hero=selection.gender==='female'?'Варианты успеха тоже. Пока они выглядят перспективнее.':'И варианты успеха тоже. Пока они выглядят перспективнее.';
    closing='Сначала наблюдаем, затем выбираем наиболее логичный вариант.';
  } else if ((name.includes('СМЕЛЬЧАК') || name.includes('СМЕЛАЯ'))) {
    thought='Последний зачёт. Ну что, посмотрим, кто кого. Главное — не сдавать назад.';
    friend=female?'Только не говори, что собираешься спорить с преподом. Ты готовилась вообще?':'Только не говори, что собираешься спорить с преподом. Ты готовился вообще?';
    hero=selection.gender==='female'?'Я? Спорить? Только если буду уверена, что права.':'Я? Спорить? Только если буду уверен, что прав.';
    closing='Лучше действовать решительно. Сомнения оставим на потом.';
  } else if (name.includes('НАБЛЮДАТЕЛЬ')) {
    thought='Последний зачёт. Сначала посмотрю на обстановку, потом решу, как себя вести.';
    friend=female?'Ты уже успела заметить что-нибудь подозрительное? И к зачёту готовилась?':'Ты уже успел заметить что-нибудь подозрительное? И к зачёту готовился?';
    hero=selection.gender==='female'?'Пока только то, что телефон лучше не доставать.':'Пока только то, что телефон лучше не доставать.';
    closing='Детали могут подсказать больше, чем кажется на первый взгляд.';
  }
  const friendSelfLine = corridorFriend.gender === 'female'
    ? ' Я бы на твоём месте сначала выдохнула.'
    : ' Я бы на твоём месте сначала выдохнул.';
  return [
    {text:`Мысли: «${thought}»`,emotion:'thinking'},
    {text:`${corridorFriend.gender === 'female' ? 'Подруга' : 'Друг'}: «${friend}${friendSelfLine}»`,emotion:'smile'},
    {text:`${corridorPlayerName()}: «${hero}»`,emotion:'confident'},
    {text:'Голос из аудитории: «Следующий!»',emotion:'worried'},
    {text:`Мысли: «${closing}»`,emotion:'thinking'}
  ];
}
async function renderCorridorBeat(): Promise<void> {
  const text=document.getElementById('corridor-dialogue-text');
  const progress=document.getElementById('corridor-progress');
  const next=document.getElementById('corridor-next') as HTMLButtonElement|null;
  const choices=document.getElementById('corridor-choices');
  const exit=document.getElementById('corridor-exit');
  if(!text||!next||!choices||!progress)return;
  const speaker=document.getElementById('corridor-player-name');
  const setSpeaker=(label:string)=>{if(!speaker)return;speaker.textContent=label.toLocaleUpperCase('ru-RU');speaker.title=label;speaker.classList.toggle('is-long-name',label.length>7);};
  if(corridorIndex<corridorBeats.length){
    const beat=corridorBeats[corridorIndex];
    next.disabled = true;
    await readyImages([selectedSpritePath(beat.emotion), `/assets/characters/${corridorFriend.folder}/${beat.emotion}.webp`]);
    let line=beat.text;
    if(line.startsWith('Мысли:')){setSpeaker(corridorPlayerName());line=line.replace(/^Мысли:\s*/, '');}
    else if(line.startsWith('Друг:') || line.startsWith('Подруга:')){setSpeaker(corridorFriend.gender === 'female' ? 'Подруга' : 'Друг');line=line.replace(/^(Друг|Подруга):\s*/, '');}
    else if(line.startsWith('Голос из аудитории:')){setSpeaker('Преподаватель');line=line.replace(/^Голос из аудитории:\s*/, '');}
    else if(line.startsWith(`${corridorPlayerName()}:`)){setSpeaker(corridorPlayerName());line=line.slice(corridorPlayerName().length+1).trim();}
    text.textContent=line;
    progress.textContent=`${corridorIndex+1} / ${corridorBeats.length}`;
    applyCharacterEmotion(beat.emotion);
    // Keep the companion on screen throughout the dialogue and mirror their expression to the scene beat.
    await showCorridorFriend(true, beat.emotion);
    next.disabled = false;
    next.textContent='ДАЛЬШЕ →';
    choices.classList.add('is-hidden'); exit?.classList.add('is-hidden');
  } else if(!corridorChoiceMade){
    showCorridorFriend(false);
    setSpeaker(corridorPlayerName());
    text.textContent='Перед дверью аудитории ты на секунду останавливаешься. Как настроишься перед зачётом?';
    progress.textContent='ВЫБОР';
    applyCharacterEmotion('normal');
    next.classList.add('is-hidden'); choices.classList.remove('is-hidden'); exit?.classList.add('is-hidden');
  } else {
    showCorridorFriend(false);
    setSpeaker('Преподаватель');
    text.textContent=selection.gender==='female'?'«Следующая!» Ты делаешь вдох и направляешься к двери.':'«Следующий!» Ты делаешь вдох и направляешься к двери.';
    progress.textContent='СЦЕНА 1 · КОРИДОР';
    next.classList.add('is-hidden'); choices.classList.add('is-hidden'); exit?.classList.remove('is-hidden');
  }
}

async function beginCorridorScene(): Promise<void> {
  // Freeze the archetype from the final skill allocation at the moment the player enters the corridor.
  // All later skill changes caused by exam answers affect scores only, not the archetype.
  if (!lockedArchetype) lockedArchetype = calculateArchetype();
  prepareCorridor();
  showCorridorFriend(false);
  corridorBeats=corridorBranch(); corridorIndex=0; corridorChoiceMade=false;
  const name=document.getElementById('corridor-player-name'); if(name){name.textContent=corridorPlayerName().toLocaleUpperCase('ru-RU'); name.title=name.textContent; name.classList.toggle('is-long-name', name.textContent.length > 7);}
  const next=document.getElementById('corridor-next'); next?.classList.remove('is-hidden');

  const corridorReady = readyImages([...corridorAssets, selectedSpritePath('thinking'), `/assets/characters/${corridorFriend.folder}/thinking.webp`]);
  // Start the archetype track while the transition is fully black.
  startArchetypeMusic();
  fadeOutIntroMusic(1200);
  await corridorReady;
  await coverScene();
  const introOverlay = document.getElementById('intro-video-overlay');
  introOverlay?.classList.add('is-hidden'); introOverlay?.setAttribute('aria-hidden', 'true');
  showScreen('corridor');
  // Run duration starts at the first visible corridor scene, not during the intro.
  corridorRunStartedAt = Date.now();
  const corridorScreen = document.getElementById('corridor-screen');
  corridorScreen?.classList.remove('corridor-scene-entered');
  await renderCorridorBeat();
  prepareClassroom();
  warmSelectedEmotions();
  warmImages(emotionNames.map(emotion => `/assets/characters/${corridorFriend.folder}/${emotion}.webp`));
  corridorScreen?.classList.add('corridor-scene-entered');
  await revealScene();
}
document.getElementById('corridor-next')?.addEventListener('click',()=>{
  if(corridorIndex<corridorBeats.length && !(document.getElementById('corridor-next') as HTMLButtonElement).disabled){corridorIndex++;void renderCorridorBeat();}
});
document.querySelectorAll<HTMLButtonElement>('#corridor-choices [data-choice]').forEach(button=>{
  button.addEventListener('click',()=>{
    const choice=button.dataset.choice as CharacterEmotion;
    corridorChoiceMade=true; applyCharacterEmotion(choice);
    const text=document.getElementById('corridor-dialogue-text');
    if(text) text.textContent=choice==='confident'?(selection.gender==='female'?'«Спокойно. Я справлюсь», — думаешь ты, расправляя плечи.':'«Спокойно. Я справлюсь», — думаешь ты, расправляя плечи.'):choice==='smile'?(selection.gender==='female'?'Ты чуть улыбаешься: «Главное — войти уверенно».':'Ты чуть улыбаешься: «Главное — войти уверенно».'):(selection.gender==='female'?'Ты оцениваешь ситуацию и решаешь не торопиться с выводами.':'Ты оцениваешь ситуацию и решаешь не торопиться с выводами.');
    document.getElementById('corridor-choices')?.classList.add('is-hidden');
    document.getElementById('corridor-next')?.classList.add('is-hidden');
    document.getElementById('corridor-exit')?.classList.remove('is-hidden');
    const progress=document.getElementById('corridor-progress');if(progress)progress.textContent='ВЫБОР СДЕЛАН';
  });
});
type ClassroomBeat = { text: string; emotion: CharacterEmotion };
let classroomBeats: ClassroomBeat[] = [];
let classroomIndex = 0;
function buildClassroomBeats(): ClassroomBeat[] {
  const female = selection.gender === 'female';
  const archetype = getArchetype().name.toLocaleUpperCase('ru-RU');
  const gendered = (male: string, fem: string) => female ? fem : male;
  let lines: string[];
  if (archetype.includes('ОТЛИЧНИК') || archetype.includes('ОТЛИЧНИЦА')) {
    lines = [
      `Я захожу в аудиторию. ${gendered('Нужно собраться и внимательно читать каждый вопрос.', 'Нужно собраться и внимательно читать каждый вопрос.')}`,
      'На доске написано: «Это ваш последний экзамен, всем удачи!» Последний — значит, права на невнимательность почти нет.',
      'Солнечный свет падает на парты. На секунду хочется задержать этот момент, но лучше сосредоточиться.',
      'Сначала спокойно осмотрюсь и отмечу, что может пригодиться. До начала ещё есть немного времени.'
    ];
  } else if (archetype.includes('ТРИКСТЕР')) {
    lines = [
      'Захожу и сразу оцениваю обстановку. План А — справиться своими силами. План Б… пусть пока останется секретом.',
      '«Это ваш последний экзамен, всем удачи!» Даже доска будто подталкивает к финальному рывку. Посмотрим, насколько всё серьёзно.',
      'Парты, стол преподавательницы, окна… Полезно знать, что происходит вокруг, прежде чем делать ход.',
      'Не буду торопиться. Сначала осмотрюсь и соберу информацию — импровизация лучше работает с подготовкой.'
    ];
  } else if (archetype.includes('РАЙАН') || archetype.includes('МЕГАН')) {
    lines = [
      `Ну вот и аудитория. ${gendered('Выгляжу спокойно — уже хорошее начало.', 'Выгляжу спокойно — уже хорошее начало')}`,
      'На доске: «Это ваш последний экзамен, всем удачи!» Красиво сказано. Осталось сделать так, чтобы удача была на моей стороне.',
      'Тёплый свет, тишина перед началом… Атмосфера почти кинематографичная. Главное — не забыть про сами ответы.',
      'Осмотрюсь, приведу мысли в порядок и встречу этот финал уверенно.'
    ];
  } else if (archetype.includes('АНАЛИТИК')) {
    lines = [
      'Вхожу и фиксирую исходные данные: расположение парт, доска, преподавательский стол, окна.',
      'На доске написано: «Это ваш последний экзамен, всем удачи!» Формулировка дружелюбная, но на результат она не влияет.',
      'Освещение хорошее, обстановка спокойная. Пока ничего не указывает на дополнительные условия.',
      'Прежде чем начнётся экзамен, осмотрю аудиторию внимательнее. Лишние детали тоже могут оказаться полезными.'
    ];
  } else if (archetype.includes('СМЕЛЬЧАК') || archetype.includes('СМЕЛАЯ')) {
    lines = [
      `Вот и аудитория. ${gendered('Я готов.', 'Я готова')} Не время отступать — осталось пройти последний этап.`,
      '«Это ваш последний экзамен, всем удачи!» — читаю на доске. Удача не помешает, но рассчитывать буду и на себя.',
      'Делаю вдох, оглядываю парты и преподавательский стол. Ничего страшного — просто ещё одно испытание.',
      'Сначала осмотрюсь, освоюсь и буду готов(а) встретить экзамен во всеоружии.'.replace('готов(а)', gendered('готов', 'готова'))
    ];
  } else if (archetype.includes('НАБЛЮДАТЕЛ')) {
    lines = [
      'Я вхожу и не спешу садиться. Сначала стоит понять, какая здесь обстановка.',
      'На доске: «Это ваш последний экзамен, всем удачи!» Интересно, кто написал это сообщение и как к нему отнесётся преподавательница.',
      'Замечаю солнечные полосы на стене, часы и аккуратно расставленные вещи. В тишине слышны даже мелкие звуки.',
      'Осмотрюсь ещё немного. Интонации, жесты и детали иногда говорят больше, чем слова.'
    ];
  } else {
    lines = [
      `Вот и аудитория. ${gendered('Главное — не накручивать себя и спокойно начать.', 'Главное — не накручивать себя и спокойно начать.')}`,
      'На доске написано: «Это ваш последний экзамен, всем удачи!» Что ж, поддержка пригодится.',
      'В аудитории тихо и светло. Нужно собраться с мыслями и понять, что меня окружает.',
      'Пока есть время, осмотрюсь и подготовлюсь к тому, что будет дальше.'
    ];
  }
  return lines.map((text, i) => ({ text, emotion: i === 1 ? 'thinking' : i === 3 ? 'confident' : 'normal' }));
}
function renderClassroomBeat(): void {
  const text = document.getElementById('classroom-dialogue-text');
  const progress = document.getElementById('classroom-progress');
  const speaker = document.getElementById('classroom-speaker');
  const next = document.getElementById('classroom-next') as HTMLButtonElement | null;
  if (!text || !progress || !speaker || !next) return;
  if (classroomIndex < classroomBeats.length) {
    text.textContent = classroomBeats[classroomIndex].text;
    progress.textContent = `${classroomIndex + 1} / ${classroomBeats.length}`;
    speaker.textContent = `МЫСЛИ · ${corridorPlayerName().toLocaleUpperCase('ru-RU')}`;
    applyCharacterEmotion(classroomBeats[classroomIndex].emotion);
    next.innerHTML = classroomIndex === classroomBeats.length - 1 ? 'ОСМОТРЕТЬСЯ <span>→</span>' : 'ДАЛЬШЕ <span>→</span>'; 
  } else {
    speaker.textContent = 'ПОСЛЕДНИЙ ЗАЧЁТ';
    text.textContent = 'Я осматриваюсь по аудитории. Здесь ещё есть на что обратить внимание — к экзамену пока не переходим.';
    progress.textContent = 'СЦЕНА ЗАВЕРШЕНА';
    next.innerHTML = 'ОСМОТРЕТЬСЯ <span>→</span>';
    next.onclick = () => window.dispatchEvent(new CustomEvent('game:classroom-look-around', { detail: { selection, skills, archetype: getArchetype().name } }));
    return;
  }
  next.onclick = () => { classroomIndex++; renderClassroomBeat(); };
}
// v67.31 — removed the male preset #3 entrance sound; the preset itself remains available.
async function beginClassroomIntro(): Promise<void> {
  void arthurHiSound.prepare(); void catMeowSound.prepare();
  prepareClassroom();
  const roomReady = readyImages(classroomAssets);
  const corridorFade = fadeOutCorridorAudio(500);
  startClassroomMusic();
  await Promise.all([roomReady, corridorFade]);
  // One-shot door SFX on entering the auditorium; it is deliberately not a Now Playing track.
  playUiSound(classroomDoorSound);
  if (isSecretPresetSelected()) { try { secretClassroomSound.pause(); secretClassroomSound.currentTime = 0; void secretClassroomSound.play().catch(() => {}); } catch {} }
  classroomBeats = buildClassroomBeats();
  classroomIndex = 0;
  const next = document.getElementById('classroom-next') as HTMLButtonElement | null;
  if (next) next.onclick = null;
  showScreen('classroom-intro');
  warmImages(['/assets/classroom-wall-gallery-background.jpeg']);
  const screen = document.getElementById('classroom-intro-screen');
  screen?.classList.remove('classroom-entered');
  renderClassroomBeat();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  screen?.classList.add('classroom-entered');
}
let corridorExitInProgress = false;
document.getElementById('corridor-exit')?.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const exitButton = document.getElementById('corridor-exit') as HTMLButtonElement | null;
  if (corridorExitInProgress || !exitButton || exitButton.classList.contains('is-hidden')) return;
  corridorExitInProgress = true;
  exitButton.disabled = true;
  exitButton.setAttribute('aria-busy', 'true');
  // iOS requires the first audible play() on this element within the trusted tap.
  if (isPhoneLayout()) { mobileClassroomWanted = true; startClassroomMusic(); }
  await transitionScene(beginClassroomIntro, classroomAssets);
  exitButton.disabled = false;
  exitButton.removeAttribute('aria-busy');
  corridorExitInProgress = false;
});

// v67.9 — gallery wall scene, shared classroom music continues uninterrupted.
type GalleryBeat = { text: string; emotion: CharacterEmotion };
let galleryBeats: GalleryBeat[] = [];
let galleryIndex = 0;
function buildGalleryBeats(): GalleryBeat[] {
  const archetype = getArchetype().name.toLocaleUpperCase('ru-RU');
  const female = selection.gender === 'female';
  const ready = female ? 'готова' : 'готов';
  let lines: string[];
  if (archetype.includes('ОТЛИЧНИК') || archetype.includes('ОТЛИЧНИЦА')) {
    lines = [
      'Взгляд цепляется за фотографии на стене. Кампус на снимках выглядит почти празднично — интересно, сколько поколений студентов проходило здесь до нас.',
      female ? '«Знания открывают возможности»… Хорошая фраза. Но сейчас мне бы не помешало ещё и вспомнить всё, что я учила к экзамену.' : '«Знания открывают возможности»… Хорошая фраза. Но сейчас мне бы не помешало ещё и вспомнить всё, что я учил к экзамену.',
      female ? 'Даже здесь есть детали, которые раньше не замечала: университетские стенды, фотографии, подписи. Надо бы как-нибудь рассмотреть их внимательнее.' : 'Даже здесь есть детали, которые раньше не замечал: университетские стенды, фотографии, подписи. Надо бы как-нибудь рассмотреть их внимательнее.',
      `Ладно, хватит отвлекаться. Я ${ready}, осталось понять, как настроены остальные перед началом.`
    ];
  } else if (archetype.includes('ТРИКСТЕР')) {
    lines = [
      'Стена выглядит как небольшая выставка достижений КИУ. Фотографии, стенды, лозунги — университет умеет напоминать о своей истории.',
      '«Знания открывают возможности». Звучит так, будто подсказку уже повесили на стену, осталось только понять, где именно она пригодится.',
      'На фотографиях — знакомые места и люди. Интересно, что ещё здесь можно заметить, если не смотреть только перед собой.',
      'Ладно, пора вернуться к реальности. Сначала посмотрю, кто уже занял места и какая там обстановка.'
    ];
  } else if (archetype.includes('РАЙАН') || archetype.includes('МЕГАН')) {
    lines = [
      'Неплохая галерея. Фото кампуса, тёплый свет, аккуратные стенды — почти готовая декорация для сцены, где всё должно пройти идеально.',
      female ? '«Знания открывают возможности». Согласна. Главное — произвести правильное впечатление и не забыть, что знания тоже пригодятся.' : '«Знания открывают возможности». Согласен. Главное — произвести правильное впечатление и не забыть, что знания тоже пригодятся.',
      'На одном снимке люди улыбаются так, будто у них уже всё получилось. Надо взять с них пример — хотя бы с выражением лица.',
      `Пора проверить, кто уже в аудитории. Уверенность у меня есть — осталось убедиться, что я ${ready} к тому, что будет дальше.`
    ];
  } else if (archetype.includes('АНАЛИТИК')) {
    lines = [
      'На стене несколько типов материалов: фотографии кампуса, информационные стенды и мотивационные плакаты. Пространство организовано довольно последовательно.',
      '«Знания открывают возможности». Формулировка широкая, но в контексте сегодняшнего дня смысл предельно конкретен.',
      'Фотографии показывают разные места университета. Я отмечаю их машинально — привычка собирать детали иногда помогает увидеть общую картину.',
      'Теперь стоит посмотреть на аудиторию целиком: кто уже пришёл, как расселись люди и что происходит перед началом.'
    ];
  } else if (archetype.includes('СМЕЛЬЧАК') || archetype.includes('СМЕЛАЯ')) {
    lines = [
      'На стене фотографии университета и стенды. Всё выглядит спокойно, почти торжественно. Значит, и мне незачем нервничать.',
      female ? '«Знания открывают возможности». Что ж, сегодня проверим, какие возможности я сумела себе открыть.' : '«Знания открывают возможности». Что ж, сегодня проверим, какие возможности я сумел себе открыть.',
      'Смотрю на снимки кампуса и невольно улыбаюсь. Столько людей прошло через эти аудитории — пройду и я.',
      `Хватит разглядывать стены. Я ${ready} действовать; сначала посмотрю на одногруппников и пойму, как они держатся.`
    ];
  } else if (archetype.includes('НАБЛЮДАТЕЛ')) {
    lines = [
      'Я задерживаю взгляд на стене. Фотографии кампуса, плакаты, стенды и даже маленькие рисунки складываются в своеобразную историю места.',
      '«Знания открывают возможности». Интересно, кто выбрал именно эту фразу. Иногда такие мелочи многое говорят о людях.',
      'На фотографии с группой люди выглядят расслабленными. На других стендах всё куда официальнее — любопытный контраст.',
      'Теперь посмотрю на тех, кто уже сидит в аудитории. По лицам и жестам иногда можно понять настроение лучше, чем по словам.'
    ];
  } else {
    lines = [
      'На стене много фотографий и университетских плакатов. Кажется, здесь собрали понемногу всего, чем гордится КИУ.',
      '«Знания открывают возможности». Пусть так и будет — сегодня точно пригодится хотя бы одна из них.',
      female ? 'Тёплый свет делает аудиторию уютнее, чем я ожидала. На секунду забываешь, зачем вообще сюда пришла.' : 'Тёплый свет делает аудиторию уютнее, чем я ожидал. На секунду забываешь, зачем вообще сюда пришёл.',
      'Ладно, пора посмотреть на одногруппников. Они уже на местах, а я пока только осваиваюсь.'
    ];
  }
  // Gender-specific wording is authored directly in each line; no parenthetical forms are shown to players.
  return lines.map((text, i) => ({ text, emotion: i === 1 ? 'thinking' : i === 3 ? 'confident' : 'normal' }));
}
function renderGalleryBeat(): void {
  const text = document.getElementById('gallery-dialogue-text');
  const progress = document.getElementById('gallery-progress');
  const speaker = document.getElementById('gallery-speaker');
  const next = document.getElementById('gallery-next') as HTMLButtonElement | null;
  if (!text || !progress || !speaker || !next) return;
  const beat = galleryBeats[galleryIndex];
  if (!beat) {
    speaker.textContent = 'ПОСЛЕДНИЙ ЗАЧЁТ';
    text.textContent = 'Взгляд наконец возвращается к аудитории. Несколько одногруппников уже сидят на местах. Пора посмотреть, как они настроены перед началом.';
    progress.textContent = 'СЦЕНА ЗАВЕРШЕНА';
    next.innerHTML = 'К ОДНОГРУППНИКАМ <span>→</span>';
    next.onclick = () => transitionToClassmatesScene();
    return;
  }
  speaker.textContent = `МЫСЛИ · ${corridorPlayerName().toLocaleUpperCase('ru-RU')}`;
  text.textContent = beat.text;
  progress.textContent = `${galleryIndex + 1} / ${galleryBeats.length}`;
  next.innerHTML = galleryIndex === galleryBeats.length - 1 ? 'ОГЛЯНУТЬСЯ <span>→</span>' : 'ДАЛЬШЕ <span>→</span>';
  applyCharacterEmotion(beat.emotion);
  next.onclick = () => { galleryIndex++; renderGalleryBeat(); };
}
async function beginClassroomGallery(): Promise<void> {
  if (isTransitioning) return;
  isTransitioning = true;
  try {
    await transitionScene(() => {
      galleryBeats = buildGalleryBeats(); galleryIndex = 0;
      showScreen('classroom-gallery'); renderGalleryBeat();
      document.getElementById('classroom-gallery-screen')?.classList.add('gallery-entered');
    }, ['/assets/classroom-wall-gallery-background.jpeg']);
    warmImages(['/assets/classroom-classmates-background.jpeg']);
  } finally { isTransitioning = false; }
}
// v67.15 — classmates scene, cat callback and male preset 3 easter egg.
type ClassmatesBeat = { speaker: string; text: string; emotion: CharacterEmotion };
let classmatesBeats: ClassmatesBeat[] = [];
let classmatesIndex = 0;
let arthurGreetingSoundPlayed = false;
function buildClassmatesBeats(): ClassmatesBeat[] {
  const archetype = getArchetype().name.toLocaleUpperCase('ru-RU');
  const female = selection.gender === 'female';
  const gendered = (male: string, fem: string) => female ? fem : male;
  const surname = corridorPlayerSurname();
  let opening: string[];
  let greeting: string;
  if (archetype.includes('ОТЛИЧНИК') || archetype.includes('ОТЛИЧНИЦА')) {
    opening = [
      'Теперь вижу остальных. Кто-то уже повторяет конспект, кто-то просто смотрит в окно. Похоже, каждый по-своему готовится к последнему испытанию.',
      'Парень в разноцветной кепке сидит впереди и выглядит удивительно спокойно. Кажется, его зовут Артур — мы уже пересекались.',
    ];
    greeting = gendered('— Привет, Артур. Как настрой перед экзаменом?', '— Привет, Артур. Как настрой перед экзаменом?');
  } else if (archetype.includes('ТРИКСТЕР')) {
    opening = [
      'Одногруппники уже расселись. Кто-то честно повторяет материал, кто-то делает вид, что совершенно не волнуется. Интересно, у кого какой план.',
      'Впереди замечаю Артура — его разноцветную кепку трудно не заметить. Он, похоже, решил не прятаться от последнего экзамена.',
    ];
    greeting = gendered('— Артур, привет! Есть секретный план на сегодня или идём по классике?', '— Артур, привет! Есть секретный план на сегодня или идём по классике?');
  } else if (archetype.includes('РАЙАН') || archetype.includes('МЕГАН')) {
    opening = [
      'А вот и одногруппники. У каждого своя тактика: кто-то сосредоточен на конспекте, кто-то старается выглядеть так, будто экзамен — обычный вторник.',
      'Парень в разноцветной кепке на переднем плане кажется самым расслабленным. Артур, если память не подводит. Самое время поздороваться уверенно.',
    ];
    greeting = gendered('— Артур, привет! Готов сегодня красиво поставить точку?', '— Артур, привет! Готов сегодня красиво поставить точку?');
  } else if (archetype.includes('АНАЛИТИК')) {
    opening = [
      'Аудитория уже почти заполнена. Несколько человек читают записи, другие наблюдают за дверью. По поведению видно: уровень напряжения у всех разный.',
      'На переднем плане парень в разноцветной кепке. Артур. Он не повторяет конспект и выглядит спокойнее большинства — любопытное наблюдение.',
    ];
    greeting = '— Привет, Артур. Уже оценил шансы на успех?';
  } else if (archetype.includes('СМЕЛЬЧАК') || archetype.includes('СМЕЛАЯ')) {
    opening = [
      'Одногруппники уже на местах. Кто-то нервно листает тетрадь, кто-то ждёт начала. Ну что, все добрались до финального уровня.',
      'Артур в своей разноцветной кепке сидит впереди. Если уж начинать этот день, то с нормального приветствия.',
    ];
    greeting = gendered('— Артур, здорово! Ну что, покажем этому экзамену, кто тут главный?', '— Артур, здорово! Ну что, покажем этому экзамену, кто тут главный?');
  } else if (archetype.includes('НАБЛЮДАТЕЛ')) {
    opening = [
      'Перевожу взгляд на одногруппников. Один перечитывает записи по кругу, другая смотрит на часы, а несколько человек стараются не встречаться глазами. Нервы у всех проявляются по-разному.',
      'Парень в разноцветной кепке на переднем плане держится свободнее остальных. Это Артур. Пожалуй, стоит проверить, такое ли у него спокойствие на самом деле.',
    ];
    greeting = '— Привет, Артур. Ты сегодня подозрительно спокоен.';
  } else {
    opening = [
      'Одногруппники уже заняли места. Кто-то повторяет материал, кто-то пытается расслабиться. Знакомая картина перед важной парой — только сегодня всё по-настоящему.',
      'Впереди сидит Артур в яркой разноцветной кепке. Его трудно не заметить. Поздороваюсь, пока преподавательница не начала.',
    ];
    greeting = '— Привет, Артур! Как сам, готов?';
  }
  let catThought: string;
  if (archetype.includes('ОТЛИЧНИК') || archetype.includes('ОТЛИЧНИЦА')) {
    catThought = gendered('Какой красивый кот… Стоп, кажется, я уже видел его где-то раньше. Даже перед экзаменом умудряюсь отвлечься на детали.', 'Какой красивый кот… Стоп, кажется, я уже видела его где-то раньше. Даже перед экзаменом умудряюсь отвлечься на детали.');
  } else if (archetype.includes('ТРИКСТЕР')) {
    catThought = gendered('Красивый кот. Погодите-ка… я ведь уже где-то его видел. Так, не время отвлекаться — хотя совпадение подозрительное.', 'Красивый кот. Погодите-ка… я ведь уже где-то его видела. Так, не время отвлекаться — хотя совпадение подозрительное.');
  } else if (archetype.includes('РАЙАН') || archetype.includes('МЕГАН')) {
    catThought = gendered('Какой красавец-кот. Стоп, мы ведь уже встречались? Ладно, похоже, даже у меня сегодня есть конкурент за внимание аудитории.', 'Какой красавец-кот. Стоп, мы ведь уже встречались? Ладно, похоже, даже у меня сегодня есть конкурент за внимание аудитории.');
  } else if (archetype.includes('АНАЛИТИК')) {
    catThought = gendered('На подоконнике кот. Выглядит знакомо… Любопытно. Надо будет вспомнить, где я уже его видел, но сначала — экзамен.', 'На подоконнике кот. Выглядит знакомо… Любопытно. Надо будет вспомнить, где я уже его видела, но сначала — экзамен.');
  } else if (archetype.includes('СМЕЛЬЧАК') || archetype.includes('СМЕЛАЯ')) {
    catThought = gendered('О, какой красивый кот! Стоп, я же где-то его уже видел. Ладно, разберусь потом — сначала надо пройти этот экзамен.', 'О, какой красивый кот! Стоп, я же где-то его уже видела. Ладно, разберусь потом — сначала надо пройти этот экзамен.');
  } else if (archetype.includes('НАБЛЮДАТЕЛ')) {
    catThought = gendered('Кот на подоконнике… красивый и будто знакомый. Я уже видел его раньше? Запомню эту деталь — вдруг она ещё всплывёт в памяти.', 'Кот на подоконнике… красивый и будто знакомый. Я уже видела его раньше? Запомню эту деталь — вдруг она ещё всплывёт в памяти.');
  } else {
    catThought = gendered('Какой красивый кот… Стоп, кажется, я уже видел его где-то. Ладно, потом вспомню — сейчас лучше настроиться на экзамен.', 'Какой красивый кот… Стоп, кажется, я уже видела его где-то. Ладно, потом вспомню — сейчас лучше настроиться на экзамен.');
  }
  return [
    { speaker: 'мысли', text: opening[0], emotion: 'thinking' },
    { speaker: 'мысли', text: opening[1], emotion: 'normal' },
    { speaker: corridorPlayerName(), text: greeting, emotion: 'smile' },
    { speaker: 'Артур', text: 'Привет.', emotion: 'normal' },
    { speaker: 'Кот', text: 'Мяу!', emotion: 'normal' },
    { speaker: 'мысли', text: catThought, emotion: 'thinking' },
    { speaker: 'мысли', text: 'Артур отвечает просто и без лишних слов. На секунду кажется, что всё идёт как обычно — будто мы просто пришли на очередную пару.', emotion: 'normal' },
    { speaker: 'мысли', text: 'Но разговоры постепенно стихают. Все понимают: дальше уже не получится отложить этот момент.', emotion: 'thinking' },
    { speaker: 'Преподавательница', text: `${surname}, чего ${selection.gender === 'female' ? 'зависла' : 'завис'}? Проходи, начинаем.`, emotion: 'worried' }
  ];
}
let classmatesRenderVersion = 0;
async function renderClassmatesBeat(): Promise<void> {
  const version = ++classmatesRenderVersion;
  arthurHiSound.stop(); catMeowSound.stop();
  const text = document.getElementById('classmates-dialogue-text');
  const progress = document.getElementById('classmates-progress');
  const speaker = document.getElementById('classmates-speaker');
  const next = document.getElementById('classmates-next') as HTMLButtonElement | null;
  if (!text || !progress || !speaker || !next) return;
  const beat = classmatesBeats[classmatesIndex];
  if (!beat) {
    progress.textContent = 'СЦЕНА ЗАВЕРШЕНА';
    speaker.textContent = 'ПОСЛЕДНИЙ ЗАЧЁТ';
    text.textContent = 'В аудитории становится тихо. Все ждут, что будет дальше.';
    next.innerHTML = 'ДАЛЬШЕ <span>→</span>';
    next.onclick = () => window.dispatchEvent(new CustomEvent('game:classmates-scene-finished', { detail: { selection, skills, archetype: getArchetype().name } }));
    return;
  }
  const cue = beat.speaker === 'Артур' && beat.text.trim() === 'Привет.' ? arthurHiSound : beat.speaker === 'Кот' && beat.text.trim() === 'Мяу!' ? catMeowSound : null;
  if (cue) {
    next.disabled = true;
    await cue.prepare();
    if (version !== classmatesRenderVersion) return;
    next.disabled = false;
  }
  speaker.textContent = beat.speaker === 'мысли' ? `МЫСЛИ · ${corridorPlayerName().toLocaleUpperCase('ru-RU')}` : beat.speaker.toLocaleUpperCase('ru-RU');
  text.textContent = beat.text;
  // Play the Roblox greeting sound once when Arthur's exact greeting is shown.
  // This is a one-shot UI sound, not a music track, so it never enters Now Playing.
  if (beat.speaker === 'Артур' && beat.text.trim() === 'Привет.' && !arthurGreetingSoundPlayed) {
    unlockAchievement('hello');
    arthurGreetingSoundPlayed = true;
    arthurHiSound.play();
  }
  // Cat sound is a one-shot effect; it does not replace background music.
  if (beat.speaker === 'Кот' && beat.text.trim() === 'Мяу!') {
    catMeowSound.play();
  }
  progress.textContent = `${classmatesIndex + 1} / ${classmatesBeats.length}`;
  next.innerHTML = classmatesIndex === classmatesBeats.length - 1 ? 'СЛУШАТЬ ПРЕПОДАВАТЕЛЬНИЦУ <span>→</span>' : 'ДАЛЬШЕ <span>→</span>';
  if (beat.speaker === 'Преподавательница') {
    // Teacher sprites are intentionally reserved for her dedicated scene; here she speaks from off-screen.
    speaker.textContent = 'ГОЛОС ПРЕПОДА';
  }
  applyCharacterEmotion(beat.emotion);
  next.onclick = () => { classmatesIndex++; renderClassmatesBeat(); };
}
async function transitionToClassmatesScene(): Promise<void> {
  if (isTransitioning) return;
  isTransitioning = true;
  try {
    await transitionScene(() => {
      classmatesBeats = buildClassmatesBeats(); classmatesIndex = 0; arthurGreetingSoundPlayed = false;
      showScreen('classroom-classmates'); renderClassmatesBeat();
      document.getElementById('classroom-classmates-screen')?.classList.add('classmates-entered');
    }, ['/assets/classroom-classmates-background.jpeg']);
    warmImages([...Object.values(teacherEmotionFiles), '/assets/exam-desk-background.webp']);
  } finally { isTransitioning = false; }
}
// The classroom intro flows into the wall-gallery, then into classmates. Exam is still a later scene.
window.addEventListener('game:classroom-look-around', () => {
  if (!document.getElementById('classroom-intro-screen')?.classList.contains('is-hidden')) beginClassroomGallery();
});

// v67.16 — teacher introduction, archetype-specific approaches and fatigue state.
type TeacherChoice = { label: string; spoken: string; thought: string; fatigueDelta: number; emotion: CharacterEmotion; relationDelta?: number };
type TeacherBeat = { speaker: string; text: string; emotion: CharacterEmotion; onShow?: () => void };
let teacherFatigue = 0;
let teacherRelationship = 50;
let teacherBeats: TeacherBeat[] = [];
let teacherBeatIndex = 0;
let teacherChoiceMade = false;
let teacherSceneBusy = false;
const teacherEmotionFiles: Record<string, string> = {
  friendly: '/assets/characters/teacher/friendly.webp',
  slightlyTired: '/assets/characters/teacher/slightly-tired.webp',
  tired: '/assets/characters/teacher/tired.webp',
  irritated: '/assets/characters/teacher/irritated.webp',
  angry: '/assets/characters/teacher/angry.webp',
  critical: '/assets/characters/teacher/critical.webp'
};
function teacherEmotionForFatigue(value: number): keyof typeof teacherEmotionFiles {
  if (value >= 96) return 'critical';
  if (value >= 81) return 'angry';
  if (value >= 61) return 'irritated';
  if (value >= 41) return 'tired';
  if (value >= 21) return 'slightlyTired';
  return 'friendly';
}
function updateTeacherSprite(): void {
  const sprite = document.getElementById('teacher-scene-sprite') as HTMLImageElement | null;
  if (sprite) {
    void swapImage(sprite, teacherEmotionFiles[teacherEmotionForFatigue(teacherFatigue)]);
    sprite.dataset.fatigue = String(teacherFatigue);
    sprite.alt = `Преподавательница: ${teacherEmotionForFatigue(teacherFatigue)}`;
  }
  window.dispatchEvent(new CustomEvent('game:teacher-state-updated', { detail: { fatigue: teacherFatigue, relationship: teacherRelationship, emotion: teacherEmotionForFatigue(teacherFatigue) } }));
}
function initialTeacherRelationship(): number {
  const a = getArchetype().name.toLocaleUpperCase('ru-RU');
  if (a.includes('ОТЛИЧНИК') || a.includes('ОТЛИЧНИЦА')) return 78;
  if (a.includes('ТРИКСТЕР')) return 36;
  if (a.includes('РАЙАН') || a.includes('МЕГАН')) return 74;
  if (a.includes('АНАЛИТИК')) return 67;
  if (a.includes('СМЕЛЬЧАК') || a.includes('СМЕЛАЯ')) return 52;
  if (a.includes('НАБЛЮДАТЕЛ')) return 62;
  return 50;
}
function buildTeacherChoices(): TeacherChoice[] {
  const a = getArchetype().name.toLocaleUpperCase('ru-RU');
  const female = selection.gender === 'female';
  const g = (male: string, fem: string) => female ? fem : male;
  if (a.includes('ОТЛИЧНИК') || a.includes('ОТЛИЧНИЦА')) return [
    { label: 'Поправить конспект', spoken: 'Я готов(а) отвечать. Главное — точность.'.replace('готов(а)', g('готов','готова')), thought: 'Даты на месте, фамилии на месте. Надеюсь, память тоже на месте.', fatigueDelta: -3, emotion: 'confident' },
    { label: 'Быстро повторить даты', spoken: 'Сейчас… 1994 год. Повторить ещё раз не помешает.', thought: 'Если повторю дату ещё раз, она либо запомнится навсегда, либо начнёт сниться.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Сделать вид, что перепутал(а) аудиторию'.replace('перепутал(а)', g('перепутал','перепутала')), spoken: 'Кажется, я ошибся дверью…'.replace('ошибся', g('ошибся','ошиблась')), thought: 'План был слабый.', fatigueDelta: 10, emotion: 'worried' }
  ];
  if (a.includes('ТРИКСТЕР')) return [
    { label: 'Незаметно оценить обстановку', spoken: 'Сначала посмотрим, есть ли вариант списать.', thought: 'Нужно понять правила игры, прежде чем в неё играть.', fatigueDelta: -3, emotion: 'thinking' },
    { label: 'Повторить факты, пока никто не видит', spoken: 'Так, 1994… основатель… Китай…', thought: 'Лучше иметь план А, прежде чем исполнять план Б.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Проверить, можно ли уйти незамеченным', spoken: 'Я только уточнить расписание…', thought: 'Преподавательница уже смотрит прямо на меня. Операция провалена до начала.', fatigueDelta: 10, emotion: 'worried' }
  ];
  if (a.includes('РАЙАН') || a.includes('МЕГАН')) return [
    { label: 'Улыбнуться и уверенно поздороваться', spoken: 'Здравствуйте! Надеюсь, сегодня у вас хорошее настроение.', thought: 'Улыбка есть. Теперь осталось добавить правильные ответы.', fatigueDelta: -3, emotion: 'smile', relationDelta: 2 },
    { label: 'Повторить ключевые факты', spoken: '1994 год, Тимирясов… Всё, собрался.'.replace('собрался', g('собрался','собралась')), thought: 'Даже харизма не заменит знание фамилий и дат.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Попробовать обаять преподавательницу', spoken: 'Думаю, сегодня мы отлично поладим!', thought: 'Она посмотрела на меня так, будто слышит эту фразу каждый семестр.', fatigueDelta: 10, emotion: 'worried' }
  ];
  if (a.includes('АНАЛИТИК')) return [
    { label: 'Оценить обстановку', spoken: 'Как ваши дела?', thought: 'Собираю данные. Паника пока статистически не обоснована.', fatigueDelta: -3, emotion: 'thinking' },
    { label: 'Повторить ключевые факты', spoken: '1994, шесть филиалов, золотая медаль — 2005.', thought: 'Если структурировать факты, вероятность перепутать их должна снизиться.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Вычислить шанс уйти без зачёта', spoken: 'Теоретически можно было бы…', thought: 'Расчёт показал: вероятность того, что меня заметят, близка к единице.', fatigueDelta: 10, emotion: 'worried' }
  ];
  if (a.includes('СМЕЛЬЧАК') || a.includes('СМЕЛАЯ')) return [
    { label: 'Решительно начать', spoken: 'Я готов(а). Давайте начинать.'.replace('готов(а)', g('готов','готова')), thought: 'Главное — не отступать от собственного ответа.', fatigueDelta: -3, emotion: 'confident', relationDelta: 1 },
    { label: 'На ходу повторить самое важное', spoken: '1994… всё, хватит. Пора.', thought: 'Нечего тянуть. Что знаю — то знаю.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Рискнуть и развернуться', spoken: 'Я вообще-то… проверял(а) дверь.'.replace('проверял(а)', g('проверял','проверяла')), thought: 'Риск был смелый. Успешным его назвать нельзя.', fatigueDelta: 10, emotion: 'worried' }
  ];
  if (a.includes('НАБЛЮДАТЕЛ')) return [
    { label: 'Осмотреться и начать', spoken: 'Я готов(а). Можно начинать.'.replace('готов(а)', g('готов','готова')), thought: 'Отмечаю тон преподавательницы и обстановку в кабинете.', fatigueDelta: -3, emotion: 'thinking' },
    { label: 'Вспомнить даты и детали', spoken: '1994 год. Остальные факты тоже должны всплыть.', thought: 'Повторение помогает, но важно не пропустить детали.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Проверить, заметят ли уход', spoken: 'Кажется, я перепутал(а) аудитории…'.replace('перепутал(а)', g('перепутал','перепутала')), thought: 'Она заметила меня раньше, чем я закончил(а) фразу.'.replace('закончил(а)', g('закончил','закончила')), fatigueDelta: 10, emotion: 'worried' }
  ];
  return [
    { label: 'Уверенно начать', spoken: 'Я готов(а).'.replace('готов(а)', g('готов','готова')), thought: 'Плечи расправлены. По крайней мере, вид у меня уверенный.', fatigueDelta: -3, emotion: 'confident' },
    { label: 'Повторить конспект', spoken: 'Так… 1994 год…', thought: 'Телефон показывает 2% заряда. Судьба решила проверить знания честно.', fatigueDelta: 10, emotion: 'thinking' },
    { label: 'Притвориться, что ошибся(лась) дверью'.replace('ошибся(лась)', g('ошибся','ошиблась')), spoken: 'Кажется, я дверью ошибся(лась)…'.replace('ошибся(лась)', g('ошибся','ошиблась')), thought: 'Стоило попробовать…', fatigueDelta: 10, emotion: 'worried' }
  ];
}
function teacherPlayerSpriteSrc(emotion: CharacterEmotion): string {
  const key = selectedCharacterKey();
  const folder = key.startsWith('female') ? key.replace('female','student_girl') : key === 'male6' ? 'student_male6' : key === 'male7' ? 'student_male7' : key.replace('male','student_boy');
  return `/assets/characters/${folder}/${emotion}.webp`;
}
function renderTeacherBeat(): void {
  const speaker = document.getElementById('teacher-speaker');
  const text = document.getElementById('teacher-dialogue-text');
  const progress = document.getElementById('teacher-progress');
  const next = document.getElementById('teacher-next') as HTMLButtonElement | null;
  const choices = document.getElementById('teacher-choices');
  const hero = document.getElementById('teacher-hero-sprite') as HTMLImageElement | null;
  if (!speaker || !text || !progress || !next || !choices) return;
  const beat = teacherBeats[teacherBeatIndex];
  if (!beat) {
    next.innerHTML = 'К ЗАЧЁТУ <span>→</span>';
    next.onclick = () => window.dispatchEvent(new CustomEvent('game:exam-intro-requested', { detail: { selection, skills, archetype: getArchetype().name, teacherFatigue, teacherRelationship } }));
    return;
  }
  speaker.textContent = beat.speaker === 'Герой' ? corridorPlayerName().toLocaleUpperCase('ru-RU') : beat.speaker.toLocaleUpperCase('ru-RU');
  text.textContent = beat.text;
  progress.textContent = `${teacherBeatIndex + 1} / ${teacherBeats.length}`;
  updateTeacherSprite();
  if (hero && teacherChoiceMade) {
    void swapImage(hero, teacherPlayerSpriteSrc(beat.emotion));
    hero.dataset.emotion = beat.emotion;
    hero.classList.remove('is-hidden');
    hero.alt = selection.gender === 'female' ? 'Главная героиня' : 'Главный герой';
  }
  next.classList.remove('is-hidden');
  next.innerHTML = teacherBeatIndex === teacherBeats.length - 1 ? 'К ЗАЧЁТУ <span>→</span>' : 'ДАЛЬШЕ <span>→</span>';
  next.onclick = () => {
    if (teacherBeatIndex >= teacherBeats.length - 1) {
      window.dispatchEvent(new CustomEvent('game:exam-intro-requested', { detail: { selection, skills, archetype: getArchetype().name, teacherFatigue, teacherRelationship } }));
      return;
    }
    teacherBeatIndex++;
    renderTeacherBeat();
  };
}
function chooseTeacherApproach(index: number): void {
  if (teacherChoiceMade) return;
  const choice = buildTeacherChoices()[index];
  if (!choice) return;
  teacherChoiceMade = true;
  document.querySelector('.teacher-dialogue-layout')?.classList.add('teacher-choice-resolved');
  teacherFatigue = Math.max(0, Math.min(100, teacherFatigue + choice.fatigueDelta));
  teacherRelationship = Math.max(0, Math.min(100, teacherRelationship + (choice.relationDelta ?? 0)));
  const choicePanel = document.getElementById('teacher-choices');
  if (choicePanel) {
    choicePanel.classList.add('is-hidden');
    choicePanel.setAttribute('hidden', '');
    choicePanel.setAttribute('aria-hidden', 'true');
    choicePanel.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      button.disabled = true;
      button.setAttribute('tabindex', '-1');
    });
  }
  const hero = document.getElementById('teacher-hero-sprite');
  hero?.classList.remove('is-hidden');
  teacherBeats = [
    { speaker: 'Герой', text: choice.spoken, emotion: choice.emotion },
    { speaker: 'МЫСЛИ', text: choice.thought, emotion: 'thinking' },
    { speaker: 'Преподавательница', text: 'Не будем томить, начнём зачёт.', emotion: teacherFatigue >= 61 ? 'worried' : 'normal' },
    { speaker: 'Герой', text: teacherClosingReaction(), emotion: 'confident' }
  ];
  teacherBeatIndex = 0;
  renderTeacherBeat();
  window.dispatchEvent(new CustomEvent('game:teacher-choice-made', { detail: { choice: index, fatigue: teacherFatigue, relationship: teacherRelationship, archetype: getArchetype().name } }));
}
function teacherClosingReaction(): string {
  const a = getArchetype().name.toLocaleUpperCase('ru-RU');
  const female = selection.gender === 'female';
  if (a.includes('ОТЛИЧНИК') || a.includes('ОТЛИЧНИЦА')) return 'Хорошо. Главное — внимательно прочитать каждый вопрос и не перепутать факты.';
  if (a.includes('ТРИКСТЕР')) return 'Ну что ж, план А официально вступает в силу. План Б пока подождёт.';
  if (a.includes('РАЙАН') || a.includes('МЕГАН')) return 'Отлично. Постараюсь, чтобы этот зачёт запомнился только с хорошей стороны.';
  if (a.includes('АНАЛИТИК')) return 'Принято. Семь вопросов — семь возможностей проверить гипотезы.';
  if (a.includes('СМЕЛЬЧАК') || a.includes('СМЕЛАЯ')) return 'Вот это разговор. Давайте начинать — отступать уже поздно.';
  if (a.includes('НАБЛЮДАТЕЛ')) return 'Хорошо. Буду следить за формулировками и не упускать детали.';
  return female ? 'Ладно, соберусь и отвечу на всё, что смогу.' : 'Ладно, соберусь и отвечу на всё, что смогу.';
}
function beginTeacherIntro(): void {
  if (teacherSceneBusy) return;
  teacherSceneBusy = true;
  teacherFatigue = 0;
  teacherRelationship = initialTeacherRelationship();
  teacherChoiceMade = false;
  document.querySelector('.teacher-dialogue-layout')?.classList.remove('teacher-choice-resolved');
  teacherBeatIndex = 0;
  teacherBeats = [{ speaker: 'Преподавательница', text: `${corridorPlayerSurname()}, чего ${selection.gender === 'female' ? 'зависла' : 'завис'}? Я тебя спрашиваю: ${selection.gender === 'female' ? 'готова' : 'готов'} к зачёту?`, emotion: 'normal' }];
  showScreen('teacher-intro');
  const screen = document.getElementById('teacher-intro-screen');
  screen?.classList.remove('teacher-entered');
  const hero = document.getElementById('teacher-hero-sprite');
  hero?.classList.add('is-hidden');
  const choices = document.getElementById('teacher-choices');
  if (choices) {
    choices.classList.remove('is-hidden');
    choices.removeAttribute('hidden');
    choices.setAttribute('aria-hidden', 'false');
    choices.querySelectorAll<HTMLButtonElement>('button[data-teacher-choice]').forEach((button, index) => {
      button.disabled = false;
      button.removeAttribute('tabindex');
      button.textContent = buildTeacherChoices()[index]?.label ?? '';
      button.onclick = () => chooseTeacherApproach(index);
    });
  }
  const next = document.getElementById('teacher-next') as HTMLButtonElement | null;
  if (next) { next.classList.add('is-hidden'); next.onclick = null; }
  updateTeacherSprite();
  renderTeacherBeat();
  next?.classList.add('is-hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => screen?.classList.add('teacher-entered')));
  teacherSceneBusy = false;
}
async function transitionToTeacherIntro(): Promise<void> {
  if (isTransitioning) return;
  isTransitioning = true;
  try { await transitionScene(beginTeacherIntro, [...classroomAssets, teacherEmotionFiles.friendly, selectedSpritePath()]); }
  finally { isTransitioning = false; }
}
window.addEventListener('game:classmates-scene-finished', () => {
  if (!document.getElementById('classroom-classmates-screen')?.classList.contains('is-hidden')) void transitionToTeacherIntro();
});

// Pointer press feedback is shared by all image-based buttons.
document.querySelectorAll<HTMLButtonElement>('.start-button, .nav-image-button').forEach((button) => {
  button.addEventListener('pointerdown', () => button.classList.add('is-pressed'));
  for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(eventName, () => button.classList.remove('is-pressed'));
  }
});


// v67.24 — exam flow. Uses the exact seven questions and mechanics from the scenario document.
type ExamQuestion = { question:string; answers:string[]; correct:number; bad:number; hint:string };
const examQuestions: ExamQuestion[] = [
 { question:'В каком году был основан КИУ?', answers:['1989','1994','2001'], correct:1, bad:0, hint:'Это произошло в середине 1990-х.' },
 { question:'Кто является основателем КИУ?', answers:['Виталий Геннадьевич Тимирясов','Виталий Гайнуллович Тимирясов','Виктор Гайнуллович Тимирясов'], correct:1, bad:2, hint:'Обратите внимание на отчество: Гайнуллович.' },
 { question:'С какой азиатской страной КИУ имеет соглашение о сотрудничестве?', answers:['Япония','Китай','Южная Корея'], correct:1, bad:0, hint:'Это одна из крупнейших стран Восточной Азии.' },
 { question:'Как первоначально назывался университет?', answers:['Институт экономики, управления и права','Казанский институт инноваций','Академия экономики и права'], correct:0, bad:1, hint:'В названии была экономика.' },
 { question:'Какое место КИУ занимает в рейтинге вузов Казани в 2026 году?', answers:['3','6','10'], correct:1, bad:2, hint:'Если в слове «SIX-SEVEN» убрать семь, сколько будет?.' },
 { question:'Сколько филиалов у КИУ?', answers:['4','6','8'], correct:1, bad:0, hint:'Чётное число, меньше восьми.' },
 { question:'В каком году университет получил золотую медаль «European Quality»?', answers:['2000','2005','2010'], correct:1, bad:2, hint:'Это середина десятилетия 2000-х.' }
];
const examArchetypeThoughts: Record<string,string> = {
 'ОТЛИЧНИК':'Нужно вспомнить точную формулировку и не перепутать факты.',
 'ОТЛИЧНИЦА':'Нужно вспомнить точную формулировку и не перепутать факты.',
 'ТРИКСТЕР':'Можно ли вычислить ответ, не рискуя лишний раз?',
 'РАЙАН ГОСЛИНГ':'Спокойно. Уверенный ответ звучит убедительнее.',
 'МЕГАН ФОКС':'Спокойно. Уверенный ответ звучит убедительнее.',
 'АНАЛИТИК':'Сравниваю варианты и ищу логическую связь.',
 'СМЕЛЬЧАК':'Не тянуть. Решение принято — отвечаю.',
 'СМЕЛАЯ':'Не тянуть. Решение принято — отвечаю.',
 'НАБЛЮДАТЕЛЬ':'В формулировке может быть важная деталь.',
 'НАБЛЮДАТЕЛЬНИЦА':'В формулировке может быть важная деталь.',
 'УНИВЕРСАЛ':'Спокойно читаю всё и выбираю лучший вариант.'
};
let examQuestionIndex = 0;
let examCorrectCount = 0;
let examHintsUsed = 0;
let examCheatAttempts = 0;
let examPhase: 'question'|'thought'|'paper'|'hint'|'feedback'|'finished' = 'question';
let examFeedbackLines: Array<{speaker:string;text:string;emotion:string}> = [];
let examFeedbackIndex = 0;
let examQuestionCheatStart = 0;
// Keep one shuffled order per question so returning from a hint does not reshuffle it.
let examAnswerOrders: number[][] = [];
function shuffledExamAnswerOrder(questionIndex:number): number[] {
 const values=examQuestions[questionIndex].answers.map((_,index)=>index);
 for(let i=values.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
 return values;
}
let examQuestionRude = false;
let examStarted = false;
function examArchetypeKey(): string { return getArchetype().name.toLocaleUpperCase('ru-RU'); }
function examThought(): string { return examArchetypeThoughts[examArchetypeKey()] || examArchetypeThoughts['УНИВЕРСАЛ']; }
function examProfileSkill(): SkillKey {
 const a=examArchetypeKey();
 if(a.includes('ТРИКСТЕР')) return 'cunning';
 if(a.includes('РАЙАН')||a.includes('МЕГАН')) return 'charisma';
 if(a.includes('АНАЛИТИК')) return 'logic';
 if(a.includes('СМЕЛ')) return 'confidence';
 if(a.includes('НАБЛЮДАТ')) return 'attention';
 return 'knowledge';
}
const examSkillFallback: Record<SkillKey,SkillKey[]> = {
 knowledge:['logic','attention','confidence','charisma','cunning'],
 logic:['knowledge','attention','cunning','confidence','charisma'],
 charisma:['confidence','cunning','attention','logic','knowledge'],
 cunning:['attention','logic','confidence','charisma','knowledge'],
 confidence:['charisma','logic','attention','cunning','knowledge'],
 attention:['logic','knowledge','cunning','confidence','charisma']
};
function examChangeKnowledge(delta:number): string {
 if(delta<0) { skills.knowledge=Math.max(0,skills.knowledge-1); gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills)); return skills.knowledge===0?'Знания −1 (минимум 0)':'Знания −1'; }
 if(skills.knowledge<4) { skills.knowledge++; gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills)); return 'Знания +1'; }
 const profile=examProfileSkill();
 if(skills[profile]<4) { skills[profile]++; gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills)); return `Знания на максимуме → ${({logic:'Логика',attention:'Внимательность',confidence:'Уверенность',charisma:'Харизма',cunning:'Хитрость',knowledge:'Знания'} as Record<SkillKey,string>)[profile]} +1`; }
 const fallback=examSkillFallback[profile].find(k=>skills[k]<4);
 if(fallback) { skills[fallback]++; gameStorage.setItem(SKILLS_KEY,JSON.stringify(skills)); return `Знания на максимуме → ${({logic:'Логика',attention:'Внимательность',confidence:'Уверенность',charisma:'Харизма',cunning:'Хитрость',knowledge:'Знания'} as Record<SkillKey,string>)[fallback]} +1`; }
 return 'Все навыки уже на максимуме.';
}
function examFatigue(delta:number): void { teacherFatigue=Math.max(0,Math.min(100,teacherFatigue+delta)); if(teacherFatigue>=100) unlockAchievement('teacher-patience'); updateExamTeacherSprite(); window.dispatchEvent(new CustomEvent('game:teacher-state-updated',{detail:{fatigue:teacherFatigue,relationship:teacherRelationship,emotion:teacherEmotionForFatigue(teacherFatigue)}})); }
function updateExamTeacherSprite(): void {
 const sprite=document.getElementById('exam-teacher-sprite') as HTMLImageElement|null;
 if(sprite) void swapImage(sprite, teacherEmotionFiles[teacherEmotionForFatigue(teacherFatigue)]);
}
function updateExamHeroSprite(emotion:string): void {
 const hero=document.getElementById('exam-hero-sprite') as HTMLImageElement|null;
 if(!hero) return;
 const valid=['normal','smile','worried','thinking','confident'];
 const e=valid.includes(emotion)?emotion:((emotion==='surprised'||emotion==='angry')?'worried':'normal');
 void swapImage(hero, teacherPlayerSpriteSrc(e as CharacterEmotion));
 hero.dataset.emotion=e;
 hero.alt=selection.gender==='female'?'Главная героиня':'Главный герой';
}
function examShowRoom(speaker:string,text:string,_emotion='normal',heroEmotion?:string,progressText?:string): void {
 const screen=document.getElementById('exam-screen');
 screen?.classList.remove('exam-paper-open');
 document.getElementById('exam-room-background')?.classList.remove('is-hidden');
 document.getElementById('exam-desk-background')?.classList.add('is-hidden');
 document.getElementById('exam-room-shade')?.classList.remove('is-hidden');
 document.getElementById('exam-dialogue-panel')?.classList.remove('is-hidden');
 const paper=document.getElementById('exam-paper-panel'); paper?.classList.add('is-hidden');
 const speakerEl=document.getElementById('exam-speaker'); if(speakerEl) speakerEl.textContent=(speaker==='Герой'?corridorPlayerName():speaker).toLocaleUpperCase('ru-RU');
 const textEl=document.getElementById('exam-dialogue-text'); if(textEl) textEl.textContent=text;
 const progress=document.getElementById('exam-progress'); if(progress) progress.textContent=progressText || `ВОПРОС ${Math.min(examQuestionIndex+1,7)} / 7`;
 const teacher=document.getElementById('exam-teacher-sprite'); teacher?.classList.remove('is-hidden');
 const hero=document.getElementById('exam-hero-sprite'); if(hero) { updateExamHeroSprite(heroEmotion ?? hero.dataset.emotion ?? 'normal'); hero.classList.remove('is-hidden'); }
 updateExamTeacherSprite();
 const next=document.getElementById('exam-next') as HTMLButtonElement|null;
 if(next) { next.classList.remove('is-hidden'); next.disabled=false; next.textContent=examPhase==='finished'?'ЗАВЕРШИТЬ СЦЕНУ':'ДАЛЬШЕ →'; next.onclick=onExamNext; }
}
function beginExam(): void {
 if(examStarted) return;
 warmImages(resultAssets);
 prepareCameo(false);
 void excellentEndingPhoneSound.prepare();
 examStarted=true; examQuestionIndex=0; examCorrectCount=0; examHintsUsed=0; examCheatAttempts=0; examQuestionCheatStart=0; examQuestionRude=false; examAnswerOrders=[]; examPhase='question'; examFeedbackIndex=0; cameoAfterQuestion=2+Math.floor(Math.random()*5); cameoBeatIndex=0; cameoActive=false; cameoPlayed=false;
 // Keep the classroom soundtrack running from the previous scene.
 showScreen('exam');
 const screen=document.getElementById('exam-screen'); screen?.classList.remove('exam-entered');
 updateExamHeroSprite('normal');
 examShowRoom('Преподавательница',examQuestions[0].question,'normal','normal','ВОПРОС 1 / 7');
 requestAnimationFrame(()=>requestAnimationFrame(()=>screen?.classList.add('exam-entered')));
}
function openExamPaper(): void {
 if (!cameoPlayed && examQuestionIndex + 1 >= cameoAfterQuestion - 1) prepareCameo(true);
 examPhase='paper';
 const screen=document.getElementById('exam-screen'); screen?.classList.add('exam-paper-open');
 document.getElementById('exam-room-background')?.classList.add('is-hidden');
 document.getElementById('exam-desk-background')?.classList.remove('is-hidden');
 document.getElementById('exam-room-shade')?.classList.add('is-hidden');
 document.getElementById('exam-dialogue-panel')?.classList.remove('is-hidden');
 document.getElementById('exam-paper-panel')?.classList.add('is-hidden');
 document.getElementById('exam-teacher-sprite')?.classList.add('is-hidden');
 document.getElementById('exam-hero-sprite')?.classList.add('is-hidden');
 const q=examQuestions[examQuestionIndex];
 const speaker=document.getElementById('exam-speaker'); if(speaker) speaker.textContent=`ВОПРОС ${examQuestionIndex+1} ИЗ 7`;
 const question=document.getElementById('exam-paper-question'); if(question) question.textContent=q.question;
 const dialogueQuestion=document.getElementById('exam-dialogue-text'); if(dialogueQuestion) dialogueQuestion.textContent=q.question;
 const answers=document.getElementById('exam-answer-list');
 if(answers) {
  answers.innerHTML='';
  if(!examAnswerOrders[examQuestionIndex]) examAnswerOrders[examQuestionIndex]=shuffledExamAnswerOrder(examQuestionIndex);
  const answerOrder=examAnswerOrders[examQuestionIndex];
  let displayIndex=0;
  answerOrder.forEach((index)=>{
   const answer=q.answers[index];
   if(examQuestionCheatStart===examQuestionIndex+1 && index===q.bad) return;
   const button=document.createElement('button'); button.type='button'; button.className='exam-answer-button'; button.dataset.answerIndex=String(index); button.textContent=`${String.fromCharCode(65+displayIndex)}) ${answer}`; displayIndex++;
   button.onclick=()=>answerExamQuestion(index); answers.appendChild(button);
  });
 }
 const status=document.getElementById('exam-action-status'); if(status) status.textContent='';
 const hint=document.getElementById('exam-hint-button') as HTMLButtonElement|null;
 const cheat=document.getElementById('exam-cheat-button') as HTMLButtonElement|null;
 const rude=document.getElementById('exam-rude-button') as HTMLButtonElement|null;
 if(hint) { hint.disabled=false; hint.onclick=showExamHint; }
 if(cheat) { cheat.disabled=false; cheat.textContent=examCheatAttempts?'Попробовать списать ещё раз':'Попробовать списать'; cheat.onclick=tryExamCheat; }
 if(rude) { rude.disabled=examQuestionRude; rude.onclick=performExamRudeness; }
 const next=document.getElementById('exam-next') as HTMLButtonElement|null; next?.classList.add('is-hidden');
}
function showExamHint(): void {
 if(examPhase!=='paper') return;
 examHintsUsed++; examFatigue(10);
 examPhase='hint';
 const q=examQuestions[examQuestionIndex];
 const screen=document.getElementById('exam-screen'); screen?.classList.remove('exam-paper-open');
 document.getElementById('exam-paper-panel')?.classList.add('is-hidden');
 const teacher=document.getElementById('exam-teacher-sprite'); teacher?.classList.remove('is-hidden');
 const hero=document.getElementById('exam-hero-sprite'); hero?.classList.remove('is-hidden');
 examShowRoom('Преподавательница',`Подсказка: ${q.hint}`,'thinking','thinking',`ПОДСКАЗКА · ВОПРОС ${examQuestionIndex+1}`);
 const next=document.getElementById('exam-next') as HTMLButtonElement|null;
 if(next) { next.textContent='ПОНЯТНО'; next.onclick=()=>openExamPaper(); }
}
function tryExamCheat(): void {
 if(examPhase!=='paper') return;
 examCheatAttempts++;
 examFatigue(examCheatAttempts===1?15:20);
 teacherRelationship=Math.max(0,teacherRelationship-(examCheatAttempts===1?0:5));
 const status=document.getElementById('exam-action-status');
 if(status) status.textContent=examCheatAttempts===1?'Ты осторожно пытаешься подсмотреть ответ…':'Ты снова пытаешься списать, но преподавательница уже следит за тобой.';
 if(examQuestionCheatStart!==examQuestionIndex+1) {
  examQuestionCheatStart=examQuestionIndex+1;
  const q=examQuestions[examQuestionIndex];
  document.querySelector<HTMLButtonElement>(`.exam-answer-button[data-answer-index="${q.bad}"]`)?.remove();
 }
 const cheat=document.getElementById('exam-cheat-button') as HTMLButtonElement|null;
 if(cheat) cheat.textContent='Попробовать списать ещё раз';
}
function performExamRudeness(): void {
 if(examPhase!=='paper'||examQuestionRude) return;
 examQuestionRude=true; examFatigue(15); teacherRelationship=Math.max(0,teacherRelationship-5);
 const status=document.getElementById('exam-action-status'); if(status) status.textContent='«Можно было бы ответить, если бы вопрос был нормальный».';
 const rude=document.getElementById('exam-rude-button') as HTMLButtonElement|null; if(rude) rude.disabled=true;
}
function archetypeAnswerReaction(correct:boolean,bad:boolean): string {
 const a=examArchetypeKey(), female=selection.gender==='female';
 if(bad) {
  if(a.includes('ТРИКСТЕР')) return 'Ладно, сделаем вид, что я этого не говорил.';
  if(a.includes('РАЙАН')||a.includes('МЕГАН')) return female?'Этого ответа не было. Начнём заново с красивого лица.':'Этого ответа не было. Начнём заново с уверенного вида.';
  if(a.includes('АНАЛИТИК')) return 'Гипотеза оказалась… крайне смелой.';
  if(a.includes('СМЕЛ')) return female?'Сказала — значит, сказала. Но это было зря.':'Сказал — значит, сказал. Но это было зря.';
  if(a.includes('НАБЛЮДАТ')) return 'Кажется, я упустил самую очевидную деталь.';
  if(a.includes('ОТЛИЧ')) return 'Так. Это явно не тот ответ, который я готовила.' .replace('готовила',female?'готовила':'готовил');
  return 'Ладно, сделаем вид, что этого не было.';
 }
 if(correct) {
  if(a.includes('ТРИКСТЕР')) return 'Отлично. И никаких лишних подозрений.';
  if(a.includes('РАЙАН')||a.includes('МЕГАН')) return 'Спокойствие и уверенность — половина успеха.';
  if(a.includes('АНАЛИТИК')) return 'Данные подтверждают гипотезу.';
  if(a.includes('СМЕЛ')) return 'Есть! Дальше.';
  if(a.includes('НАБЛЮДАТ')) return 'Важно было заметить формулировку.';
  if(a.includes('ОТЛИЧ')) return 'Хорошо. Факты на месте.';
  return female?'Хорошо, один ответ есть.':'Хорошо, один ответ есть.';
 }
 if(a.includes('ТРИКСТЕР')) return 'План был хороший. Ответ — не очень.';
 if(a.includes('РАЙАН')||a.includes('МЕГАН')) return 'Даже уверенный тон не спасает от ошибки.';
 if(a.includes('АНАЛИТИК')) return 'Похоже, в рассуждении была ошибка.';
 if(a.includes('СМЕЛ')) return female?'Решилась быстро, но не угадала.':'Решился быстро, но не угадал.';
 if(a.includes('НАБЛЮДАТ')) return 'Нужно было внимательнее прочитать вопрос.';
 if(a.includes('ОТЛИЧ')) return 'Надо было ещё раз проверить факты.';
 return 'Кажется, я поспешил с ответом…'.replace('поспешил',female?'поспешила':'поспешил');
}
function answerExamQuestion(index:number): void {
 if(examPhase!=='paper') return;
 if (examQuestionIndex >= 2) warmImages(achievementAssets);
 const q=examQuestions[examQuestionIndex]; const correct=index===q.correct; const bad=index===q.bad;
 document.querySelectorAll<HTMLButtonElement>('.exam-answer-button').forEach(b=>b.disabled=true);
 if(correct) {
  examCorrectCount++; examFatigue(0);
  teacherRelationship=Math.min(100,teacherRelationship+(skills.charisma>=3?4:2));
 } else {
  examFatigue(bad?15:10); examChangeKnowledge(-1);
 }
 let skillMessage='';
 if(correct) skillMessage=examChangeKnowledge(1);
 else skillMessage=bad?'Знания −1':'Знания −1';
 const teacherLine=correct?'Верно. Хорошо, идём дальше':bad?'Это даже близко не тот ответ. Давайте соберёмся.':'Нет, это неправильный ответ. Слушайте вопрос внимательнее.';
 const heroLine=archetypeAnswerReaction(correct,bad);
 examFeedbackLines=[
  {speaker:'Преподавательница',text:teacherLine,emotion:correct?'friendly':bad?'critical':'irritated'},
  {speaker:'Герой',text:`${heroLine} (${skillMessage})`,emotion:correct?'confident':bad?'worried':'thinking'}
 ];
 examFeedbackIndex=0; examPhase='feedback';
 showExamFeedbackLine();
}
function showExamFeedbackLine(): void {
 const line=examFeedbackLines[examFeedbackIndex]; if(!line) return;
 examShowRoom(line.speaker,line.text,line.emotion,line.speaker==='Герой'||line.speaker==='МЫСЛИ'?line.emotion:undefined,`ВОПРОС ${examQuestionIndex+1} / 7 · РЕАКЦИЯ`);
 const next=document.getElementById('exam-next') as HTMLButtonElement|null;
 if(next) { next.textContent=examFeedbackIndex===examFeedbackLines.length-1?(examQuestionIndex===6?'К РЕЗУЛЬТАТАМ →':'СЛЕДУЮЩИЙ ВОПРОС →'):'ДАЛЬШЕ →'; next.onclick=onExamNext; }
}
type CameoBeat = { image: string; speaker: string; text: string; alt: string };
const friendlyCameoBeats: CameoBeat[] = [
 { image: '/assets/cameo/kftm3-entry.webp', speaker: 'KFTM3', text: 'Здравствуйте! Как у вас дела?', alt: 'KFTM3 и друг входят в аудиторию' },
 { image: '/assets/cameo/kftm3-friendly-reply.webp', speaker: 'ПРЕПОД', text: 'Здравствуйте, ребята! Зайдите лучше чуть позже, сейчас я занята.', alt: 'Преподавательница занята бумагами за столом' },
 { image: '/assets/cameo/kftm3-goodbye.webp', speaker: 'KFTM3', text: 'Хорошо, не будем мешать, всего хорошего!', alt: 'KFTM3 и друг вежливо прощаются' }
];
const angryCameoBeats: CameoBeat[] = [
 { image: '/assets/cameo/kftm3-entry.webp', speaker: 'KFTM3', text: 'Здравствуйте! Как у вас дела?', alt: 'KFTM3 и друг входят в аудиторию' },
 { image: '/assets/cameo/kftm3-angry-teacher.webp', speaker: 'ПРЕПОД', text: 'ВЫШЛИ ОТСЮДА, НЕ БЕСИТЕ МЕНЯ!!!', alt: 'Разгневанная преподавательница кричит и указывает на выход' },
 { image: '/assets/cameo/kftm3-angry-exit.webp', speaker: 'KFTM3', text: 'Ой, что-то она не в настроении, Денчик, валим отсюда.', alt: 'KFTM3 и Денчик испуганно отходят от двери аудитории' }
];
let activeCameoBeats: CameoBeat[] = friendlyCameoBeats;
let cameoAfterQuestion = 0;
let cameoBeatIndex = 0;
let cameoActive = false;
let cameoPlayed = false;

// Cameo music temporarily replaces the classroom soundtrack; its position is restored afterward.
const friendlyCameoMusic = createAudio('/audio/cameo/elevator-music-background.mp3');
friendlyCameoMusic.preload = 'none';
friendlyCameoMusic.loop = true;
friendlyCameoMusic.volume = 0.82;
const angryCameoMusic = createAudio('/audio/cameo/fnaf-1-music-box.mp3');
angryCameoMusic.preload = 'none';
angryCameoMusic.loop = true;
angryCameoMusic.volume = 0.88;
let activeCameoMusic: HTMLAudioElement | null = null;
let savedClassroomMusicState: { currentTime: number; volume: number; wasPlaying: boolean } | null = null;

function startCameoMusic(angry: boolean): void {
  if (activeCameoMusic) {
    activeCameoMusic.pause();
    activeCameoMusic.currentTime = 0;
  }
  savedClassroomMusicState = {
    currentTime: classroomMusic.currentTime,
    volume: classroomMusic.volume,
    wasPlaying: !classroomMusic.paused,
  };
  if (classroomMusicFadeTimer !== undefined) window.clearInterval(classroomMusicFadeTimer);
  classroomMusicFadeTimer = undefined;
  classroomMusic.pause();
  hideNowPlaying();
  activeCameoMusic = angry ? angryCameoMusic : friendlyCameoMusic;
  activeCameoMusic.currentTime = 0;
  void activeCameoMusic.play().catch((error) => console.warn('Cameo music could not start:', error));
}

function stopCameoMusicAndRestoreExam(): void {
  if (activeCameoMusic) {
    activeCameoMusic.pause();
    activeCameoMusic.currentTime = 0;
    activeCameoMusic = null;
  }
  const saved = savedClassroomMusicState;
  savedClassroomMusicState = null;
  if (!saved) return;
  classroomMusic.currentTime = saved.currentTime;
  classroomMusic.volume = saved.volume;
  if (saved.wasPlaying) {
    // Resume the classroom soundtrack silently: the auditorium track card was
    // already shown on entry and must not pop up again after the cameo.
    void classroomMusic.play().catch((error) => console.warn('Classroom music could not resume after cameo:', error));
  }
}

function prepareCameo(all: boolean): void {
  warmImages(all ? [...new Set([...friendlyCameoBeats, ...angryCameoBeats].map(beat => beat.image))] : [friendlyCameoBeats[0].image]);
  if (all) { prepareAudio(friendlyCameoMusic); prepareAudio(angryCameoMusic); }
}
let cameoTransitioning = false;
let cameoRenderVersion = 0;
async function startFriendlyCameo(): Promise<void> {
  const overlay = document.getElementById('cameo-overlay');
  if (!overlay || cameoActive || cameoPlayed) return;
  activeCameoBeats = teacherFatigue > 70 ? angryCameoBeats : friendlyCameoBeats;
  cameoActive = true; cameoPlayed = true; cameoBeatIndex = 0; cameoTransitioning = true;
  prepareCameo(true);
  try {
    await showFriendlyCameoBeat();
    if (!cameoActive) return;
    startCameoMusic(activeCameoBeats === angryCameoBeats);
    overlay.classList.remove('is-hidden'); overlay.setAttribute('aria-hidden', 'false');
    hideNowPlaying();
  } finally { cameoTransitioning = false; }
}
async function showFriendlyCameoBeat(): Promise<void> {
  const version = ++cameoRenderVersion;
  const beat = activeCameoBeats[cameoBeatIndex];
  if (!beat) return;
  const next = document.getElementById('cameo-next') as HTMLButtonElement | null;
  if (next) next.disabled = true;
  await readyImages([beat.image]);
  if (!cameoActive || version !== cameoRenderVersion) return;
  const image = document.getElementById('cameo-scene-image') as HTMLImageElement | null;
  if (image) { await swapImage(image, beat.image); image.alt = beat.alt; }
  if (!cameoActive || version !== cameoRenderVersion) return;
  document.querySelector('.cameo-scene-frame')?.classList.toggle('cameo-angry-shake', activeCameoBeats === angryCameoBeats && cameoBeatIndex === 1);
  const speaker = document.getElementById('cameo-speaker'); if (speaker) speaker.textContent = beat.speaker;
  const text = document.getElementById('cameo-dialogue-text'); if (text) text.textContent = beat.text;
  const progress = document.getElementById('cameo-progress'); if (progress) progress.textContent = `КАМЕО · ${cameoBeatIndex + 1} / ${activeCameoBeats.length}`;
  warmImages(activeCameoBeats.slice(cameoBeatIndex + 1).map(nextBeat => nextBeat.image));
  if (next) { next.disabled = false; next.innerHTML = cameoBeatIndex === activeCameoBeats.length - 1 ? 'ВЕРНУТЬСЯ К ЗАЧЁТУ <span>→</span>' : 'ПРОДОЛЖИТЬ <span>→</span>'; }
}
async function advanceCameo(): Promise<void> {
  if (!cameoActive || cameoTransitioning) return;
  cameoTransitioning = true;
  try {
    if (cameoBeatIndex < activeCameoBeats.length - 1) {
      cameoBeatIndex++; await showFriendlyCameoBeat(); return;
    }
    cameoActive = false; stopCameoMusicAndRestoreExam();
    const overlay = document.getElementById('cameo-overlay');
    overlay?.classList.add('is-hidden'); overlay?.setAttribute('aria-hidden', 'true');
    if (examQuestionIndex < 6) {
      examQuestionIndex++; examQuestionCheatStart = 0; examQuestionRude = false; examPhase = 'question';
      examShowRoom('Преподавательница', examQuestions[examQuestionIndex].question, 'normal', 'normal', `ВОПРОС ${examQuestionIndex + 1} / 7`);
    }
  } finally { cameoTransitioning = false; }
}

document.getElementById('cameo-next')?.addEventListener('click', advanceCameo);

function onExamNext(): void {
 if (cameoActive) return;
 if(examPhase==='question') {
  examPhase='thought'; examShowRoom('МЫСЛИ',examThought(),'thinking','thinking');
  const next=document.getElementById('exam-next') as HTMLButtonElement|null; if(next){next.textContent='К ЛИСТКУ →'; next.onclick=onExamNext;}
  return;
 }
 if(examPhase==='thought') { openExamPaper(); return; }
 if(examPhase==='feedback') {
  if(examFeedbackIndex<examFeedbackLines.length-1) { examFeedbackIndex++; showExamFeedbackLine(); return; }
  if(examQuestionIndex<6) {
   const completedQuestion = examQuestionIndex + 1;
   if(!cameoPlayed && completedQuestion === cameoAfterQuestion) {
    startFriendlyCameo();
    return;
   }
   examQuestionIndex++; examQuestionCheatStart=0; examQuestionRude=false; examPhase='question';
   examShowRoom('Преподавательница',examQuestions[examQuestionIndex].question,'normal','normal',`ВОПРОС ${examQuestionIndex+1} / 7`);
   return;
  }
  // The final «К РЕЗУЛЬТАТАМ» click launches an eligible ending directly.
  // Other archetypes/score ranges keep the existing results hand-off for their future endings.
  const endingCorrect = examCorrectCount;
  const endingArchetype = examArchetypeKey();
  const isExcellentArchetype = endingArchetype.includes('ОТЛИЧНИК') || endingArchetype.includes('ОТЛИЧНИЦ');
  const isTricksterArchetype = endingArchetype.includes('ТРИКСТЕР');
  const isCharismaArchetype = endingArchetype.includes('РАЙАН ГОСЛИНГ') || endingArchetype.includes('МЕГАН ФОКС');
  const isAnalystArchetype = endingArchetype.includes('АНАЛИТИК');
  const isBraveArchetype = endingArchetype.includes('СМЕЛЬЧАК') || endingArchetype.includes('СМЕЛАЯ') || endingArchetype.includes('BOLD') || endingArchetype.includes('BRAVE');
  const isObserverArchetype = endingArchetype.includes('НАБЛЮДАТЕЛЬ');
  const isUniversalArchetype = endingArchetype.includes('УНИВЕРСАЛ') || endingArchetype.includes('UNIVERSAL');
  const startsArchetypeEnding = (isExcellentArchetype || isTricksterArchetype || isCharismaArchetype || isAnalystArchetype || isBraveArchetype || isObserverArchetype || isUniversalArchetype) && endingCorrect >= 0 && endingCorrect <= 7;
  if (startsArchetypeEnding) {
   window.dispatchEvent(new CustomEvent('game:exam-scene-finished',{detail:{correct:endingCorrect,isExcellentEnding:isExcellentArchetype,isTricksterEnding:isTricksterArchetype,isCharismaEnding:isCharismaArchetype,isAnalystEnding:isAnalystArchetype,isBraveEnding:isBraveArchetype,isObserverEnding:isObserverArchetype,isUniversalEnding:endingArchetype.includes('УНИВЕРСАЛ') || endingArchetype.includes('UNIVERSAL'),archetype:endingArchetype,hints:examHintsUsed,cheatAttempts:examCheatAttempts,teacherFatigue,teacherRelationship,skills:{...skills}}}));
   return;
  }
  examPhase='finished';
  examShowRoom('Преподавательница','Ну что, перейдём к результатам…','normal',undefined,'ЗАЧЁТ ЗАВЕРШЁН');
  const next=document.getElementById('exam-next') as HTMLButtonElement|null;
  if(next){next.textContent='ЗАВЕРШИТЬ СЦЕНУ';next.onclick=()=>{window.dispatchEvent(new CustomEvent('game:exam-scene-finished',{detail:{correct:examCorrectCount,hints:examHintsUsed,cheatAttempts:examCheatAttempts,teacherFatigue,teacherRelationship,skills:{...skills}}}));next.disabled=true;next.classList.add('is-hidden');};}
  return;
 }
}
window.addEventListener('game:exam-intro-requested', async () => {
  if (isTransitioning || examStarted) return;
  isTransitioning = true;
  try { await transitionScene(beginExam, classroomAssets); } finally { isTransitioning = false; }
});


type ExcellentEndingBeat = { image: string; speaker: string; text: string; period: 'past' | 'evening' | 'present'; alt: string; fade?: boolean };
let corridorRunStartedAt = 0;
let endingRunDurationMs = 0;
let excellentEndingBeats: ExcellentEndingBeat[] = [];
let excellentEndingIndex = 0;
let excellentEndingTransition = false;
function endingPlayerName(): string {
  try {
    const player = JSON.parse(gameStorage.getItem('last-exam-player-data') || '{}');
    return String(player.givenName || player.name || 'Отличник').trim() || 'Отличник';
  } catch { return 'Отличник'; }
}
function buildExcellentEndingBeats(correctAnswers: number, endingType: 'brave' | 'trickster' | 'charisma' | 'analyst' | 'observer' | 'universal' | 'excellent' = 'excellent'): ExcellentEndingBeat[] {
  const playerName = endingPlayerName();
  const isFemale = String(selection.gender).toLocaleLowerCase('ru-RU') === 'female';
  if (endingType === 'brave') return buildBraveEndingBeats(correctAnswers, playerName, isFemale);
  if (endingType === 'trickster') return buildTricksterEndingBeats(correctAnswers, playerName, isFemale);
  if (endingType === 'charisma') return buildCharismaEndingBeats(correctAnswers, playerName, isFemale);
  if (endingType === 'analyst') return buildAnalystEndingBeats(correctAnswers, playerName, isFemale);
  if (endingType === 'observer') return buildObserverEndingBeats(correctAnswers, playerName, isFemale);
  if (endingType === 'universal') return buildUniversalEndingBeats(correctAnswers, playerName, isFemale);
  const studyImage = isFemale
    ? '/assets/endings/excellent/female-frame-1.webp'
    : '/assets/endings/excellent/male-study.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const passbookImage = isFemale
    ? '/assets/endings/excellent/female-passbook.webp'
    : '/assets/endings/excellent/male-passbook.webp';
  const preparedLine = isFemale
    ? 'Ещё пять минут, надо убедиться, что всё запомнила.'
    : 'Ещё пять минут, надо убедиться, что всё запомнил.';
  const celebrationLine = isFemale
    ? 'Ура, не зря готовилась всю ночь.'
    : 'Ура, не зря готовился всю ночь.';
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const teacherResultLine = isFailedEnding
    ? 'К сожалению, вы не сдали зачёт.'
    : isBestEnding
      ? 'Вы сдали зачёт, поздравляю.'
      : 'Вы сдали зачёт, не идеально, конечно, но сдали.';
  const studentResultLine = isFailedEnding
    ? (isFemale ? 'Как так? Я же готовилась…' : 'Как так? Я же готовился…')
    : isBestEnding
      ? celebrationLine
      : (isFemale
        ? 'Отлично, а можно узнать, где я допустила неточности?'
        : 'Отлично, а можно узнать, где я допустил неточности?');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Не понимаю, как так вышло… Я ведь столько готовилась, почти не спала, повторяла всё до последнего. И всё равно провалила зачёт. Где я ошиблась? Как теперь объяснить это маме?..'
      : 'Не понимаю, как так вышло… Я ведь столько готовился, почти не спал, повторял всё до последнего. И всё равно провалил зачёт. Где я ошибся? Как теперь объяснить это маме?..')
    : isBestEnding
      ? (isFemale
        ? 'Последний зачёт сдан. Всё, теперь никаких ведомостей и бессонных ночей. Я так долго к этому шла… Наконец-то свобода!'
        : 'Последний зачёт сдан. Всё, теперь никаких ведомостей и бессонных ночей. Я так долго к этому шёл… Наконец-то свобода!')
      : (isFemale
        ? 'Ну и ладно, пару ошибок — ничего страшного. Главное, зачёт сдан! Последний зачёт позади, можно наконец выдохнуть. Свобода!'
        : 'Ну и ладно, пару ошибок — ничего страшного. Главное, зачёт сдан! Последний зачёт позади, можно наконец выдохнуть. Свобода!');
  return [
    { image: studyImage, speaker: 'МЫСЛИ', text: 'На часах 03:40. До зачёта остаётся всего несколько часов.', period: 'past', alt: 'Первое лицо: конспекты и учебники на столе, время 03:40' },
    { image: '/assets/endings/excellent/flashback-mother.webp', speaker: 'МАМА', text: 'Ты спать-то собираешься?', period: 'past', alt: 'Мама открывает дверь и заглядывает в комнату поздней ночью' },
    { image: studyImage, speaker: playerName, text: preparedLine, period: 'past', alt: 'Отличник продолжает готовиться к зачёту' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: (isFemale ? '/assets/endings/excellent/female-result-background.webp' : '/assets/endings/excellent/male-result-background.webp'), speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: teacherResultLine, period: 'present', alt: isFemale ? 'Первое лицо: студентка держит зачётку, преподавательница объявляет итог зачёта' : 'Первое лицо: студент держит зачётку, преподавательница объявляет итог зачёта' },
    { image: (isFailedEnding ? (isFemale ? '/assets/endings/excellent/female-result-background.webp' : '/assets/endings/excellent/male-result-background.webp') : passbookImage), speaker: playerName, text: studentResultLine, period: 'present', alt: isFailedEnding ? (isFemale ? 'Первое лицо: студентка держит зачётку и реагирует на несданный зачёт' : 'Первое лицо: студент держит зачётку и реагирует на несданный зачёт') : 'Отличник реагирует на результат зачёта' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Пустой университетский коридор в тёплом вечернем свете; студент выходит из аудитории' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: isFailedEnding ? 'Расстроенный студент идёт по университетскому коридору после неудачной сдачи зачёта' : 'Студент идёт по университетскому коридору после сдачи последнего зачёта' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в университетском коридоре' }
  ];
}
function buildBraveEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = isFemale
    ? '/assets/endings/brave/female-frame-1.webp'
    : '/assets/endings/brave/male-frame-1.webp';
  const flashback2 = isFemale
    ? '/assets/endings/brave/female-frame-2.webp'
    : '/assets/endings/brave/male-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Вот это поворот… Я была уверена, что вывезу, но одной уверенности оказалось мало. Ладно, бывает. В следующий раз подготовлюсь, а не буду надеяться на удачу.'
      : 'Вот это поворот… Я был уверен, что вывезу, но одной уверенности оказалось мало. Ладно, бывает. В следующий раз подготовлюсь, а не буду надеяться на удачу.')
    : isBestEnding
      ? (isFemale
        ? 'Ну а что я говорила? Спокойствие, уверенность — и всё получилось. Хотя, признаю, немного знаний тоже пригодилось.'
        : 'Ну а что я говорил? Спокойствие, уверенность — и всё получилось. Хотя, признаю, немного знаний тоже пригодилось.')
      : (isFemale
        ? 'Зачёт есть! Может, не так уверенно, как я рассчитывала, но главное — не растерялась и довела дело до конца.'
        : 'Зачёт есть! Может, не так уверенно, как я рассчитывал, но главное — не растерялся и довёл дело до конца.');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Похоже, одной смелости недостаточно, если за ней ничего не стоит. На пересдачу приду подготовленной. Уверенность никуда не денется — просто теперь подкреплю её знаниями.'
      : 'Похоже, одной смелости недостаточно, если за ней ничего не стоит. На пересдачу приду подготовленным. Уверенность никуда не денется — просто теперь подкреплю её знаниями.')
    : isBestEnding
      ? (isFemale
        ? 'Иногда нужно просто поверить в себя и не дать волнению взять верх. Я рискнула, не отступила — и сдала отлично. Пожалуй, иногда смелость действительно открывает двери.'
        : 'Иногда нужно просто поверить в себя и не дать волнению взять верх. Я рискнул, не отступил — и сдал отлично. Пожалуй, иногда смелость действительно открывает двери.')
      : (isFemale
        ? 'План «разберусь на месте» сработал не без приключений, но зачёт у меня в кармане. В следующий раз добавлю к уверенности хотя бы немного подготовки — так будет надёжнее.'
        : 'План «разберусь на месте» сработал не без приключений, но зачёт у меня в кармане. В следующий раз добавлю к уверенности хотя бы немного подготовки — так будет надёжнее.');
  return [
    { image: flashback1, speaker: 'ДРУГ · ТЕЛЕФОН', text: 'Слушай, ты вообще собираешься готовиться к завтрашнему зачёту?', period: 'evening', alt: 'Друг звонит студенту вечером перед зачётом' },
    { image: flashback1, speaker: playerName, text: isFemale ? 'Да расслабься. Я в себе уверена — разберусь на месте. Не впервой же выкручиваться!' : 'Да расслабься. Я в себе уверен — разберусь на месте. Не впервой же выкручиваться!', period: 'evening', alt: 'Смельчак уверенно отвечает другу по телефону' },
    { image: flashback2, speaker: playerName, text: isFemale ? 'Сумка собрана, всё на месте. Завтра просто зайду, спокойно отвечу и заберу свой зачёт. Чего зря переживать?' : 'Сумка собрана, всё на месте. Завтра просто зайду, спокойно отвечу и заберу свой зачёт. Чего зря переживать?', period: 'evening', alt: 'Смельчак собирает сумку на зачёт и уверен в успехе' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: studentResultLine, period: 'present', alt: 'Смельчак реагирует на результат зачёта' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Смельчак размышляет об уверенности и результате зачёта' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в коридоре' }
  ];
}

function buildTricksterEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = isFemale
    ? '/assets/endings/trickster/female-frame-1.webp'
    : '/assets/endings/trickster/male-frame-1.webp';
  const flashback2 = isFemale
    ? '/assets/endings/trickster/female-frame-2.webp'
    : '/assets/endings/trickster/male-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Так, спокойно. Похоже, шпаргалки сегодня подвели. Надо было учить, а не только хитрить.'
      : 'Так, спокойно. Похоже, шпаргалки сегодня подвели. Надо было учить, а не только хитрить.')
    : isBestEnding
      ? (isFemale
        ? 'Ну что, план сработал. Хотя, если честно, знания тоже пригодились.'
        : 'Ну что, план сработал. Хотя, если честно, знания тоже пригодились.')
      : (isFemale
        ? 'Не идеально, конечно. План сработал лишь наполовину, но зачёт есть — уже неплохо.'
        : 'Не идеально, конечно. План сработал лишь наполовину, но зачёт есть — уже неплохо.');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Ладно, признаю: на одной хитрости далеко не уедешь. План провалился, а пересдача уже маячит на горизонте. В следующий раз подготовлюсь по-настоящему… и, может, одну шпаргалку на всякий случай.'
      : 'Ладно, признаю: на одной хитрости далеко не уедешь. План провалился, а пересдача уже маячит на горизонте. В следующий раз подготовлюсь по-настоящему… и, может, одну шпаргалку на всякий случай.')
    : isBestEnding
      ? (isFemale
        ? 'Хитрость ещё никому не мешала — особенно когда за ней стоят хоть какие-то знания. Всё прошло почти идеально. Главное теперь — не рассказывать, насколько тщательно я готовила запасной план.'
        : 'Хитрость ещё никому не мешала — особенно когда за ней стоят хоть какие-то знания. Всё прошло почти идеально. Главное теперь — не рассказывать, насколько тщательно я готовил запасной план.')
      : (isFemale
        ? 'Тактика сработала не идеально: пару раз я явно была на грани. Но зачёт есть, а значит, операция всё-таки успешна. В следующий раз придётся продумать план получше.'
        : 'Тактика сработала не идеально: пару раз я явно был на грани. Но зачёт есть, а значит, операция всё-таки успешна. В следующий раз придётся продумать план получше.');
  return [
    { image: flashback1, speaker: 'МЫСЛИ', text: 'Ночь перед зачётом. Учить всё подряд? Слишком предсказуемо. Надо подготовить план Б.', period: 'past', alt: 'Трикстер готовит шпаргалки к зачёту' },
    { image: flashback2, speaker: playerName, text: isFemale ? 'Так, шпаргалки на месте, ручка на месте… Теперь главное — выглядеть так, будто я просто очень хорошо подготовилась.' : 'Так, шпаргалки на месте, ручка на месте… Теперь главное — выглядеть так, будто я просто очень хорошо подготовился.', period: 'past', alt: 'Трикстер прячет шпаргалки в сумку перед зачётом' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Первое лицо: студент держит зачётку, преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: studentResultLine, period: 'present', alt: isFailedEnding ? 'Трикстер реагирует на несданный зачёт' : 'Трикстер реагирует на успешно сданный зачёт' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Трикстер размышляет о результате зачёта в коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в коридоре' }
  ];
}
function buildCharismaEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = isFemale
    ? '/assets/endings/charisma/megan-frame-1.webp'
    : '/assets/endings/charisma/gosling-frame-1.webp';
  const flashback2 = isFemale
    ? '/assets/endings/charisma/megan-frame-2.webp'
    : '/assets/endings/charisma/gosling-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Ладно, сегодня одной улыбки оказалось мало. Похоже, преподавательница всё-таки ждала ответы, а не обаяние.'
      : 'Ладно, сегодня одного обаяния оказалось мало. Похоже, преподавательница всё-таки ждала ответы, а не уверенный взгляд.')
    : isBestEnding
      ? (isFemale
        ? 'Ну вот. Спокойствие, уверенность и немного обаяния — рабочее сочетание. Хотя пару ответов я всё-таки знала.'
        : 'Ну вот. Спокойствие, уверенность и немного обаяния — рабочее сочетание. Хотя пару ответов я всё-таки знал.')
      : (isFemale
        ? 'Не безупречно, но зачёт есть. Видимо, харизма помогла пережить те вопросы, на которые я отвечала наугад.'
        : 'Не безупречно, но зачёт есть. Видимо, харизма помогла пережить те вопросы, на которые я отвечал наугад.');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Кажется, харизма всё-таки не заменяет подготовку. В этот раз уверенный вид не спас. Ладно, к пересдаче придётся подготовиться, а обаяние оставлю как приятный бонус.'
      : 'Кажется, харизма всё-таки не заменяет подготовку. В этот раз уверенный вид не спас. Ладно, к пересдаче придётся подготовиться, а обаяние оставлю как приятный бонус.')
    : isBestEnding
      ? (isFemale
        ? 'Я же говорила: не обязательно проводить всю ночь за учебниками. Уверенность решает многое — особенно когда за ней всё-таки есть знания. Сегодня всё прошло красиво.'
        : 'Я же говорил: не обязательно проводить всю ночь за учебниками. Уверенность решает многое — особенно когда за ней всё-таки есть знания. Сегодня всё прошло красиво.')
      : (isFemale
        ? 'Так, план сработал, но не на все сто. На харизме далеко не каждый вопрос вывезешь, зато зачёт в кармане. В следующий раз хотя бы основные темы повторю.'
        : 'Так, план сработал, но не на все сто. На харизме далеко не каждый вопрос вывезешь, зато зачёт в кармане. В следующий раз хотя бы основные темы повторю.');
  return [
    { image: flashback1, speaker: 'МЫСЛИ', text: isFemale ? 'Ночь перед зачётом. Сидеть до утра над конспектами? Нет уж. Иногда лучший план — прийти спокойно и обаятельно.' : 'Ночь перед зачётом. Сидеть до утра над конспектами? Нет уж. Иногда лучший план — прийти спокойно и обаятельно.', period: 'past', alt: isFemale ? 'Меган Фокс решает положиться на харизму перед зачётом' : 'Райан Гослинг решает положиться на харизму перед зачётом' },
    { image: flashback2, speaker: playerName, text: isFemale ? 'Я ещё ни разу не подводила себя уверенностью. Всё будет нормально. А теперь — спать, красоте тоже нужен отдых.' : 'Меня ещё ни разу не подводила уверенность. Всё будет нормально. А теперь — спать, харизме тоже нужен отдых.', period: 'past', alt: isFemale ? 'Меган Фокс спокойно ложится спать вместо долгой подготовки' : 'Райан Гослинг спокойно ложится спать вместо долгой подготовки' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: studentResultLine, period: 'present', alt: isFailedEnding ? 'Герой реагирует на несданный зачёт' : 'Герой реагирует на успешно сданный зачёт' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Герой размышляет о харизме и результате зачёта в коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке героя в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Герой отвечает на звонок мамы в коридоре' }
  ];
}
function buildAnalystEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = '/assets/endings/analyst/analyst-frame-1.webp';
  const flashback2 = '/assets/endings/analyst/analyst-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Странно. Я всё рассчитала, проверила факты, рассмотрела варианты… Значит, в исходных данных была ошибка.'
      : 'Странно. Я всё рассчитал, проверил факты, рассмотрел варианты… Значит, в исходных данных была ошибка.')
    : isBestEnding
      ? (isFemale
        ? 'Результат соответствует прогнозу. Подготовка окупилась — приятно, когда расчёты сходятся.'
        : 'Результат соответствует прогнозу. Подготовка окупилась — приятно, когда расчёты сходятся.')
      : (isFemale
        ? 'Зачёт получен. Не все предположения подтвердились, но общей картины хватило.'
        : 'Зачёт получен. Не все предположения подтвердились, но общей картины хватило.');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Вывод: мой анализ оказался неполным. Я слишком доверилась расчётам и не учла несколько важных деталей. К пересдаче соберу больше данных, проверю гипотезы и подготовлю запасной план. Ошибка — тоже информация.'
      : 'Вывод: мой анализ оказался неполным. Я слишком доверился расчётам и не учёл несколько важных деталей. К пересдаче соберу больше данных, проверю гипотезы и подготовлю запасной план. Ошибка — тоже информация.')
    : isBestEnding
      ? (isFemale
        ? 'Гипотеза подтвердилась: системная подготовка работает. Я собрала информацию, выделила закономерности и заранее продумала возможные вопросы. Итог закономерен — хотя проверить выводы на практике всё равно было полезно.'
        : 'Гипотеза подтвердилась: системная подготовка работает. Я собрал информацию, выделил закономерности и заранее продумал возможные вопросы. Итог закономерен — хотя проверить выводы на практике всё равно было полезно.')
      : (isFemale
        ? 'В целом расчёт оказался верным, хотя несколько вопросов выбились из прогноза. Зачёт есть — это главное. В следующий раз расширю выборку и уделю больше внимания исключениям.'
        : 'В целом расчёт оказался верным, хотя несколько вопросов выбились из прогноза. Зачёт есть — это главное. В следующий раз расширю выборку и уделю больше внимания исключениям.');
  return [
    { image: flashback1, speaker: 'МЫСЛИ', text: isFemale ? 'До зачёта несколько часов. Начну с систематизации тем: факты, даты, причинно-следственные связи. Если разложить всё по полочкам, неопределённости станет меньше.' : 'До зачёта несколько часов. Начну с систематизации тем: факты, даты, причинно-следственные связи. Если разложить всё по полочкам, неопределённости станет меньше.', period: 'past', alt: 'Аналитик тщательно готовится к зачёту, изучает данные и закономерности' },
    { image: flashback2, speaker: playerName, text: isFemale ? 'Я проверила основные темы, разобрала дополнительные вопросы и составила прогноз. Информации достаточно, слабые места отмечены. Теперь я уверена: зачёт должен пройти по плану.' : 'Я проверил основные темы, разобрал дополнительные вопросы и составил прогноз. Информации достаточно, слабые места отмечены. Теперь я уверен: зачёт должен пройти по плану.', period: 'past', alt: 'Аналитик собрал дополнительные материалы и уверен в подготовке' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: studentResultLine, period: 'present', alt: isFailedEnding ? 'Аналитик осмысливает неудачный результат' : 'Аналитик реагирует на результат зачёта' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: isFemale ? 'Всего хорошего!' : 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Аналитик размышляет о результате зачёта в коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в коридоре' }
  ];
}

function buildObserverEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = isFemale
    ? '/assets/endings/observer/female-frame-1.webp'
    : '/assets/endings/observer/male-frame-1.webp';
  const flashback2 = isFemale
    ? '/assets/endings/observer/female-frame-2.webp'
    : '/assets/endings/observer/male-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Я упустила что-то важное. Надо было внимательнее проверить детали, а не просто запомнить их.'
      : 'Я упустил что-то важное. Надо было внимательнее проверить детали, а не просто запомнить их.')
    : isBestEnding
      ? (isFemale
        ? 'Я заметила даже мелочи, которые легко пропустить. Хорошо, что уделила им внимание.'
        : 'Я заметил даже мелочи, которые легко пропустить. Хорошо, что уделил им внимание.')
      : (isFemale
        ? 'Зачёт есть. Пара деталей всё-таки ускользнула, но в целом я справилась.'
        : 'Зачёт есть. Пара деталей всё-таки ускользнула, но в целом я справился.');
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Похоже, я слишком сосредоточилась на отдельных деталях и пропустила главное. К пересдаче буду не только наблюдать, но и связывать факты между собой. В следующий раз ничего не ускользнёт.'
      : 'Похоже, я слишком сосредоточился на отдельных деталях и пропустил главное. К пересдаче буду не только наблюдать, но и связывать факты между собой. В следующий раз ничего не ускользнёт.')
    : isBestEnding
      ? (isFemale
        ? 'Всё сходится: внимательность не подвела. Я отмечала важные моменты, запоминала детали и смогла восстановить общую картину. Иногда достаточно просто увидеть то, что остальные не замечают.'
        : 'Всё сходится: внимательность не подвела. Я отмечал важные моменты, запоминал детали и смог восстановить общую картину. Иногда достаточно просто увидеть то, что остальные не замечают.')
      : (isFemale
        ? 'В целом всё прошло неплохо. Несколько деталей я упустила, но главное заметила и зачёт получила. В следующий раз составлю памятку ещё точнее.'
        : 'В целом всё прошло неплохо. Несколько деталей я упустил, но главное заметил и зачёт получил. В следующий раз составлю памятку ещё точнее.');
  return [
    { image: flashback1, speaker: 'МЫСЛИ', text: isFemale ? 'За один вечер, конечно, всё не выучить. Да и пытаться запомнить абсолютно каждую мелочь — так себе идея. Лучше сосредоточиться на том, что действительно могут спросить: важные даты, ключевые события, фамилии. И главное — понять, как всё это между собой связано. Так, это я уже повторила. А вот этот момент лучше ещё раз проверить.' : 'За один вечер, конечно, всё не выучить. Да и пытаться запомнить абсолютно каждую мелочь — так себе идея. Лучше сосредоточиться на том, что действительно могут спросить: важные даты, ключевые события, фамилии. И главное — понять, как всё это между собой связано. Так, это я уже повторил. А вот этот момент лучше ещё раз проверить.', period: 'evening', alt: 'Наблюдатель внимательно готовится к зачёту и отмечает важные моменты' },
    { image: flashback2, speaker: playerName, text: isFemale ? 'Так, памятка готова. Основные события, даты, имена — всё самое важное на одном листе. Главное — не растеряться и вспомнить нужное в подходящий момент. Вроде бы ничего важного не упустила.' : 'Так, памятка готова. Основные события, даты, имена — всё самое важное на одном листе. Главное — не растеряться и вспомнить нужное в подходящий момент. Вроде бы ничего важного не упустил.', period: 'evening', alt: 'Наблюдательница или наблюдатель составляет памятку с ключевыми фактами к зачёту' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: studentResultLine, period: 'present', alt: isFailedEnding ? 'Наблюдатель осмысливает неудачный результат' : 'Наблюдатель реагирует на результат зачёта' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Наблюдатель размышляет о результате зачёта в коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в коридоре' }
  ];
}


function buildUniversalEndingBeats(correctAnswers: number, playerName: string, isFemale: boolean): ExcellentEndingBeat[] {
  const isBestEnding = correctAnswers >= 6;
  const isFailedEnding = correctAnswers <= 3;
  const flashback1 = isFemale
    ? '/assets/endings/universal/female-frame-1.webp'
    : '/assets/endings/universal/male-frame-1.webp';
  const flashback2 = isFemale
    ? '/assets/endings/universal/female-frame-2.webp'
    : '/assets/endings/universal/male-frame-2.webp';
  const teacherImage = isFemale
    ? '/assets/endings/excellent/female-teacher-checking.webp'
    : '/assets/endings/excellent/male-teacher-checking.webp';
  const resultImage = isFemale
    ? '/assets/endings/excellent/female-result-background.webp'
    : '/assets/endings/excellent/male-result-background.webp';
  const studentResultLine = isFailedEnding
    ? (isFemale
      ? 'Ну вот… Надеялась, что обычной подготовки хватит. Видимо, какие-то темы всё-таки стоило повторить получше.'
      : 'Ну вот… Надеялся, что обычной подготовки хватит. Видимо, какие-то темы всё-таки стоило повторить получше.')
    : isBestEnding
      ? 'Отлично! Похоже, не зря потратил(а) вечер на подготовку. Главное — не паниковать и отвечать спокойно.'
      : (isFemale
        ? 'Ну, зачёт есть — уже хорошо. На некоторые вопросы ответила не идеально, но в целом справилась.'
        : 'Ну, зачёт есть — уже хорошо. На некоторые вопросы ответил не идеально, но в целом справился.');
  const normalizedResultLine = isBestEnding ? (isFemale
    ? 'Отлично! Похоже, не зря потратила вечер на подготовку. Главное — не паниковать и отвечать спокойно.'
    : 'Отлично! Похоже, не зря потратил вечер на подготовку. Главное — не паниковать и отвечать спокойно.') : studentResultLine;
  const monologueLine = isFailedEnding
    ? (isFemale
      ? 'Ладно, бывает. Подготовилась, но, похоже, где-то недоработала. К пересдаче распределю время получше и повторю темы, в которых не уверена. Главное — сделать выводы и двигаться дальше.'
      : 'Ладно, бывает. Подготовился, но, похоже, где-то недоработал. К пересдаче распределю время получше и повторю темы, в которых не уверен. Главное — сделать выводы и двигаться дальше.')
    : isBestEnding
      ? (isFemale
        ? 'А всё оказалось не так страшно. Немного подготовки, собранная сумка, спокойная голова — и вот результат. Не обязательно быть гением или зубрить всю ночь. Иногда достаточно просто не откладывать всё на последний момент.'
        : 'А всё оказалось не так страшно. Немного подготовки, собранная сумка, спокойная голова — и вот результат. Не обязательно быть гением или зубрить всю ночь. Иногда достаточно просто не откладывать всё на последний момент.')
      : (isFemale
        ? 'Не идеально, но и не провал — зачёт в кармане. В следующий раз начну готовиться чуть раньше и уделю больше внимания сложным темам. А сейчас можно наконец выдохнуть.'
        : 'Не идеально, но и не провал — зачёт в кармане. В следующий раз начну готовиться чуть раньше и уделю больше внимания сложным темам. А сейчас можно наконец выдохнуть.');
  return [
    { image: flashback1, speaker: 'МЫСЛИ', text: isFemale
      ? 'Так, завтра зачёт. Пожалуй, сегодня стоит немного позаниматься, чтобы утром не метаться по комнате в поисках конспектов. Пройдусь по основным темам, повторю то, что хуже помню, — и хватит на сегодня.'
      : 'Так, завтра зачёт. Пожалуй, сегодня стоит немного позаниматься, чтобы утром не метаться по комнате в поисках конспектов. Пройдусь по основным темам, повторю то, что хуже помню, — и хватит на сегодня.', period: 'evening', alt: 'Обычный студент готовится к зачёту вечером за письменным столом' },
    { image: flashback2, speaker: playerName, text: isFemale
      ? 'Всё, самое важное повторила. Теперь соберу сумку, положу конспект и ручки, чтобы утром ничего не забыть. Не скажу, что знаю вообще всё, но к зачёту готова настолько, насколько успела.'
      : 'Всё, самое важное повторил. Теперь соберу сумку, положу конспект и ручки, чтобы утром ничего не забыть. Не скажу, что знаю вообще всё, но к зачёту готов настолько, насколько успел.', period: 'evening', alt: 'Студент или студентка собирает сумку перед зачётом' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: 'Так, ладно, проверю вашу ведомость…', period: 'present', alt: 'Преподавательница проверяет ведомость в аудитории', fade: true },
    { image: resultImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'К сожалению, вы не сдали зачёт.' : isBestEnding ? 'Вы сдали зачёт, поздравляю.' : 'Вы сдали зачёт, не идеально, конечно, но сдали.', period: 'present', alt: 'Преподавательница объявляет итог зачёта' },
    { image: resultImage, speaker: playerName, text: normalizedResultLine, period: 'present', alt: isFailedEnding ? 'Универсал осмысливает неудачный результат' : 'Универсал реагирует на результат зачёта' },
    { image: teacherImage, speaker: 'ПРЕПОДАВАТЕЛЬНИЦА', text: isFailedEnding ? 'Подготовитесь лучше к пересдаче.' : 'Иди уже.', period: 'present', alt: 'Преподавательница указывает в сторону двери' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: playerName, text: 'Всего хорошего!', period: 'present', alt: 'Студент выходит в университетский коридор' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: monologueLine, period: 'present', alt: 'Обычный студент размышляет о результате зачёта в коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МЫСЛИ', text: 'Телефон начинает звонить.', period: 'present', alt: 'Телефон звонит в руке студента в университетском коридоре' },
    { image: '/assets/endings/excellent/hallway.webp', speaker: 'МАМА · ТЕЛЕФОН', text: 'Ну что, рассказывай, как прошёл зачёт?', period: 'present', alt: 'Студент отвечает на звонок мамы в коридоре' }
  ];
}

function showExcellentEndingBeat(playCue = true): void {
  excellentEndingPhoneSound.stop();
  const beat = excellentEndingBeats[excellentEndingIndex];
  if (!beat) return;
  const image = document.getElementById('excellent-ending-image') as HTMLImageElement | null;
  const period = document.getElementById('excellent-ending-period');
  const speaker = document.getElementById('excellent-ending-speaker');
  const text = document.getElementById('excellent-ending-text');
  const progress = document.getElementById('excellent-ending-progress');
  const scene = document.getElementById('excellent-ending-scene');
  if (image) { void swapImage(image, beat.image); image.alt = beat.alt; }
  warmImages(excellentEndingBeats.slice(excellentEndingIndex + 1, excellentEndingIndex + 3).map(next => next.image));
  // Play the door sound when mom enters the room, and again as the student leaves the classroom.
  const isSpecialArchetypeEnding = excellentEndingBeats[0]?.image.includes('/brave/') || excellentEndingBeats[0]?.image.includes('/trickster/') || excellentEndingBeats[0]?.image.includes('/charisma/') || excellentEndingBeats[0]?.image.includes('/analyst/') || excellentEndingBeats[0]?.image.includes('/observer/') || excellentEndingBeats[0]?.image.includes('/universal/');
  if ((!isSpecialArchetypeEnding && excellentEndingIndex === 1) || excellentEndingIndex === (isSpecialArchetypeEnding ? 6 : 7)) playExcellentEndingSound(excellentEndingDoorSound);
  // Let the ringtone play just before the mother speaks on the phone.
  if (period) { period.textContent = beat.period === 'past' ? 'ПРОШЛОЙ НОЧЬЮ:' : beat.period === 'evening' ? 'ПРОШЛЫМ ВЕЧЕРОМ:' : ''; period.classList.toggle('is-hidden', beat.period !== 'past' && beat.period !== 'evening'); }
  if (speaker) speaker.textContent = beat.speaker;
  if (text) text.textContent = beat.text;
  if (playCue && beat.speaker.includes('ТЕЛЕФОН')) excellentEndingPhoneSound.play();
  if (progress) progress.textContent = `КОНЦОВКА · ${excellentEndingIndex + 1} / ${excellentEndingBeats.length}`;
  scene?.classList.remove('is-fading');
}
let endingCreditsOverlay: HTMLDivElement | null = null;
let endingCreditsTimer: number | null = null;
let creditsFinishing = false;
async function finishEndingCredits(watchedToEnd = false): Promise<void> {
  if (creditsFinishing || !endingCreditsOverlay) return;
  creditsFinishing = true;
  if (endingCreditsTimer !== null) {
    window.clearTimeout(endingCreditsTimer);
    endingCreditsTimer = null;
  }
  if (watchedToEnd) unlockAchievement('credits-respect');
  const creditsVideo = endingCreditsOverlay.querySelector('video');
  if (creditsVideo) { creditsVideo.pause(); creditsVideo.autoplay = false; creditsVideo.removeAttribute('src'); creditsVideo.load(); }
  await readyImages(resultAssets);
  endingCreditsOverlay.remove();
  endingCreditsOverlay = null;
  showFinalResultScreen();
  creditsFinishing = false;
}

function formatRunDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ensureFinalResultMotionStyles(): void {
  if (document.getElementById('final-result-motion-styles')) return;
  const style = document.createElement('style');
  style.id = 'final-result-motion-styles';
  style.textContent = `@keyframes final-campus-drift { 0% { transform: scale(1.08) translate3d(-.5%, -.35%, 0); } 100% { transform: scale(1.13) translate3d(.5%, .35%, 0); } } @media (prefers-reduced-motion: reduce) { #final-result-screen img:first-child { animation: none !important; } }`;
  document.head.appendChild(style);
}

let preparedResultAudio: { music: HTMLAudioElement; sting: HTMLAudioElement } | null = null;
function prepareResultAudio(): { music: HTMLAudioElement; sting: HTMLAudioElement } {
  if (!preparedResultAudio) {
    preparedResultAudio = {
      music: createAudio('/assets/endings/final-screen/omplete-sound.mp3'),
      sting: createAudio(examCorrectCount <= 3 ? '/assets/endings/final-screen/fail-result.mp3' : examCorrectCount >= 6 ? '/assets/endings/final-screen/excellent-result.mp3' : '/assets/endings/final-screen/pass-result.mp3'),
    };
    prepareAudio(preparedResultAudio.music); prepareAudio(preparedResultAudio.sting);
  }
  return preparedResultAudio;
}
function showFinalResultScreen(): void {
  warmImages(achievementAssets);
  ensureFinalResultMotionStyles();
  unlockAchievement('the-end');
  const finalArchetypeName = lockedArchetype?.name || getArchetype().name;
  recordCompletedArchetype(finalArchetypeName);
  // The final-result track replaces any music or ambience from earlier scenes.
  if (archetypeMusicFadeTimer !== undefined) window.clearInterval(archetypeMusicFadeTimer);
  archetypeMusicFadeTimer = undefined;
  archetypeMusic.pause(); archetypeMusic.currentTime = 0; archetypeMusic.volume = 0;
  if (corridorAmbience) { corridorAmbience.pause(); corridorAmbience.currentTime = 0; }
  stopClassroomMusic();
  endingMusic.pause(); endingMusic.currentTime = 0;
  document.getElementById('final-result-test-button')?.remove();
  document.getElementById('final-result-screen')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'final-result-screen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Итог зачёта');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483001', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#132744', opacity: '0', transition: 'opacity .7s ease'
  });
  const background = document.createElement('img');
  background.src = '/assets/campus-background.webp';
  background.alt = '';
  Object.assign(background.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.08)', animation: 'final-campus-drift 28s ease-in-out infinite alternate', willChange: 'transform' });
  const book = document.createElement('div'); book.className = 'final-result-book';
  Object.assign(book.style, { position: 'relative', width: 'min(96vw, 1600px)', aspectRatio: '1671 / 941', maxHeight: '94vh', flex: '0 1 auto', transform: 'translateY(0) scale(1)', filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))', transition: 'transform .28s ease, filter .28s ease', cursor: 'default' });
  book.addEventListener('pointerenter', () => { book.style.transform = 'translateY(-10px) scale(1.008)'; book.style.filter = 'drop-shadow(0 18px 18px rgba(0,0,0,.38))'; });
  book.addEventListener('pointerleave', () => { book.style.transform = 'translateY(0) scale(1)'; book.style.filter = 'drop-shadow(0 0 0 rgba(0,0,0,0))'; });
  const texture = document.createElement('img');
  texture.src = '/assets/endings/final-screen/passbook.webp';
  texture.alt = 'Итог зачёта';
  Object.assign(texture.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' });
  book.appendChild(texture);

  const player = (() => { try { return JSON.parse(gameStorage.getItem('last-exam-player-data') || '{}'); } catch { return {}; } })();
  const archetype = (lockedArchetype || calculateArchetype()).name;
  const result = examCorrectCount <= 3 ? 'НЕ СДАН' : examCorrectCount >= 6 ? 'ОТЛИЧНО' : 'ЗАЧЁТ';
  const date = new Date();
  const dateText = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  const fields: Array<{key:string; text:string; left:number; top:number; width:number; height:number; size:number; align?:string; bold?:boolean}> = [
    { key: 'surname', text: String(player.surname || '—'), left: 32.8, top: 33.5, width: 18.5, height: 5.5, size: 1.35 },
    { key: 'given-name', text: String(player.givenName || '—'), left: 32.8, top: 44.1, width: 18.5, height: 5.5, size: 1.35 },
    { key: 'group', text: String(player.group || '—'), left: 32.8, top: 54.7, width: 18.5, height: 5.5, size: 1.35 },
    { key: 'discipline', text: 'История КИУ', left: 64.1, top: 26.8, width: 24.8, height: 5.5, size: 1.25 },
    { key: 'result', text: result, left: 65.2, top: 35.0, width: 23.0, height: 9.0, size: 2.1, align: 'center', bold: true },
    { key: 'correct', text: String(examCorrectCount), left: 67.2, top: 49.5, width: 3.0, height: 5.0, size: 1.45, align: 'center', bold: true },
    { key: 'total', text: '7', left: 70.6, top: 49.5, width: 3.0, height: 5.0, size: 1.45, align: 'center', bold: true },
    { key: 'archetype', text: archetype, left: 71.1, top: 59.4, width: 16.0, height: 5.0, size: 1.2 },
    { key: 'duration', text: formatRunDuration(endingRunDurationMs), left: 66.6, top: 69.6, width: 12.0, height: 5.0, size: 1.35, align: 'center', bold: true },
    { key: 'date', text: dateText, left: 58.1, top: 79.7, width: 26.8, height: 5.0, size: 1.35, align: 'center' }
  ];
  for (const field of fields) {
    const node = document.createElement('div');
    node.className = 'final-result-field'; node.dataset.field = field.key;
    node.textContent = field.text;
    Object.assign(node.style, {
      position: 'absolute', left: `${field.left}%`, top: `${field.top}%`, width: `${field.width}%`, height: `${field.height}%`,
      display: 'flex', alignItems: 'center', justifyContent: field.align === 'center' ? 'center' : 'flex-start',
      overflow: 'hidden', color: '#142e68', fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: `clamp(9px, ${field.size}cqw, 25px)`, fontWeight: field.bold ? '700' : '500',
      lineHeight: '1.05', textAlign: field.align || 'left', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      textShadow: '0 0 .5px rgba(255,255,255,.35)'
    });
    if (field.text === result) node.style.transform = 'rotate(-5deg)';
    book.appendChild(node);
  }
  // Character mini-portrait inside the photo frame on the left page.
  const portrait = document.createElement('img');
  portrait.className = 'final-result-portrait';
  portrait.alt = 'Портрет игрока';
  portrait.src = selection.gender === 'female'
    ? `/assets/characters/student_girl${selection.femalePreset + 1}/card.webp`
    : selection.malePreset === SECRET_MALE_PRESET
      ? '/assets/characters/student_male6/card.webp'
      : selection.malePreset === DEVIL_MALE_PRESET
        ? '/assets/characters/student_male7/card.webp'
        : `/assets/characters/student_boy${selection.malePreset + 1}/card.webp`;
  Object.assign(portrait.style, {
    position: 'absolute', left: '15.5%', top: '27.2%', width: '13.8%', height: '39.8%',
    objectFit: 'contain', objectPosition: 'center', zIndex: '2'
  });
  portrait.onerror = () => { portrait.onerror = null; portrait.style.display = 'none'; };
  book.appendChild(portrait);
  // Container query units keep typography proportional to the book texture on different screens.
  book.style.containerType = 'inline-size';
  // Play the outcome-specific sting first, then switch to the looping final-screen soundtrack.
  // 4-5 correct = GTA IV; 6-7 = GTA: San Andreas mission complete; 0-3 = MK3 suspense.
  const { music: resultMusic, sting: resultSting } = prepareResultAudio();
  preparedResultAudio = null;
  resultMusic.loop = true; resultMusic.volume = 0.72;
  resultSting.loop = false; resultSting.volume = 0.82;
  resultMusic.dataset.finalResultMusic = 'true'; resultSting.dataset.finalResultMusic = 'true';
  let resultAudioStopped = false;
  const startLoopingResultMusic = () => {
    if (resultAudioStopped) return;
    resultMusic.currentTime = 0;
    void resultMusic.play().catch(() => { /* browser autoplay policy may require a user gesture */ });
  };
  resultSting.addEventListener('ended', startLoopingResultMusic, { once: true });
  void resultSting.play().catch(() => {
    // If the browser blocks the short sting, don't leave the screen silent.
    startLoopingResultMusic();
  });

  const buttons = document.createElement('div');
  buttons.id = 'final-result-actions';
  Object.assign(buttons.style, {
    position: 'fixed', left: '50%', bottom: 'max(14px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
    zIndex: '2147483002', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px',
    width: 'min(96vw, 900px)', flexWrap: 'wrap'
  });
  const makeActionButton = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    Object.assign(button.style, {
      padding: '12px 18px', minHeight: '42px', border: '1px solid rgba(228,238,255,.8)', borderRadius: '4px',
      background: primary ? 'rgba(24,65,139,.96)' : 'rgba(12,26,52,.94)', color: '#fff',
      font: '700 12px Arial,sans-serif', letterSpacing: '.7px', cursor: 'pointer',
      boxShadow: '0 5px 16px rgba(0,0,0,.35)', transition: 'transform .18s ease, background .18s ease'
    });
    button.addEventListener('pointerenter', () => { button.style.transform = 'translateY(-2px)'; });
    button.addEventListener('pointerleave', () => { button.style.transform = 'translateY(0)'; });
    button.addEventListener('click', onClick);
    return button;
  };
  const stopResultMusic = () => {
    resultAudioStopped = true;
    resultSting.pause(); resultSting.currentTime = 0; resultSting.remove();
    resultMusic.pause(); resultMusic.currentTime = 0; resultMusic.remove();
  };
  buttons.append(
    makeActionButton('В ГЛАВНОЕ МЕНЮ', () => {
      // Returning to the title screen must reset the transient state just like replay;
      // otherwise one-shot intro/ending guards stay set and the next run skips endings/credits.
      stopResultMusic();
      overlay.remove(); buttons.remove();
      document.getElementById('final-result-achievements-placeholder')?.remove();
      document.getElementById('final-result-test-button')?.remove();
      // Keep the ending DOM mounted for the next run. startExcellentEnding() reuses
      // #excellent-ending and its Next button; removing it here permanently broke endings
      // after returning to the menu.
      const endingOverlay = document.getElementById('excellent-ending');
      endingOverlay?.classList.add('is-hidden');
      endingOverlay?.classList.remove('is-blackout');
      endingOverlay?.setAttribute('aria-hidden', 'true');
      const endingScene = document.getElementById('excellent-ending-scene');
      endingScene?.classList.remove('is-fading');
      const endingNext = document.getElementById('excellent-ending-next') as HTMLButtonElement | null;
      if (endingNext) { endingNext.disabled = false; endingNext.classList.remove('is-hidden'); endingNext.textContent = 'ДАЛЕЕ →'; }
      document.getElementById('ending-credits-overlay')?.remove();
      const creditsVideo = document.getElementById('ending-credits-video') as HTMLVideoElement | null;
      if (creditsVideo) { creditsVideo.pause(); try { creditsVideo.currentTime = 0; } catch { /* ignore media teardown */ } }
      endingCreditsOverlay = null;
      if (endingCreditsTimer !== null) { window.clearTimeout(endingCreditsTimer); endingCreditsTimer = null; }
      introVideoInProgress = false;
      introVideoFinished = false;
      introVideoShown = false;
      excellentEndingIndex = 0; excellentEndingBeats = []; excellentEndingTransition = false;
      lockedArchetype = null;
      corridorMusicStarted = false; corridorRunStartedAt = 0; endingRunDurationMs = 0;
      corridorIndex = 0; corridorChoiceMade = false; corridorBeats = [];
      preparedFriendFor = null;
      teacherFatigue = 0; teacherRelationship = 50; teacherBeats = []; teacherBeatIndex = 0;
      teacherChoiceMade = false; teacherSceneBusy = false;
      examQuestionIndex = 0; examCorrectCount = 0; examHintsUsed = 0; examCheatAttempts = 0;
      examPhase = 'question'; examFeedbackLines = []; examFeedbackIndex = 0;
      examQuestionCheatStart = 0; examAnswerOrders = []; examQuestionRude = false; examStarted = false;
      skills = { knowledge: 0, logic: 0, charisma: 0, cunning: 0, confidence: 0, attention: 0 };
      gameStorage.removeItem(SKILLS_KEY);
      activeEmotion = 'normal';
      applyCharacterEmotion('normal');
      renderSelection();
      // Stop any previous-run soundtrack; the main menu remains clean and its own
      // start button will unlock/restart the opening music through the normal flow.
      for (const audio of [introMusic, archetypeMusic, corridorAmbience, classroomMusic, endingMusic]) {
        if (audio) { audio.pause(); try { audio.currentTime = 0; } catch { /* ignore media teardown */ } }
      }
      hideNowPlaying();
      transitionOverlay?.classList.remove('is-active');
      isTransitioning = false;
      cameoActive = false; cameoPlayed = false; cameoBeatIndex = 0;
      arthurGreetingSoundPlayed = false;
      document.getElementById('cameo-overlay')?.classList.add('is-hidden');
      document.getElementById('cameo-overlay')?.setAttribute('aria-hidden', 'true');
      showScreen('start');
    }),
    makeActionButton('ДОСТИЖЕНИЯ', () => showAchievementsPage()),
    makeActionButton('ПРОЙТИ ИГРУ ЕЩЁ РАЗ', async () => {
      unlockAchievement('only-the-beginning');
      // Put a real full-screen blackout above every scene/ending layer before resetting.
      // The previous version only toggled the regular screen and left the ending dialogue
      // (#excellent-ending) visible above it, so the player appeared to return to the last line.
      const replayFade = document.createElement('div');
      replayFade.id = 'replay-transition-blackout';
      Object.assign(replayFade.style, {
        position: 'fixed', inset: '0', zIndex: '2147483647', background: '#000',
        opacity: '0', transition: 'opacity 420ms ease', pointerEvents: 'all'
      });
      document.body.appendChild(replayFade);
      void replayFade.offsetWidth;
      replayFade.style.opacity = '1';
      await wait(450);

      // Start the opening soundtrack inside the click gesture (browser autoplay policy),
      // and restart it from the beginning just like the first time the player enters character selection.
      stopResultMusic();
      if (introMusic) { introMusic.pause(); introMusic.currentTime = 0; introMusic.volume = 0.75; }

      overlay.remove(); buttons.remove();
      document.getElementById('final-result-achievements-placeholder')?.remove();
      document.getElementById('final-result-test-button')?.remove();
      // Clear transient ending state but preserve the reusable ending DOM. Removing
      // #excellent-ending meant the next run had no overlay for startExcellentEnding().
      const endingOverlay = document.getElementById('excellent-ending');
      endingOverlay?.classList.add('is-hidden');
      endingOverlay?.classList.remove('is-blackout');
      endingOverlay?.setAttribute('aria-hidden', 'true');
      const endingScene = document.getElementById('excellent-ending-scene');
      endingScene?.classList.remove('is-fading');
      const endingNext = document.getElementById('excellent-ending-next') as HTMLButtonElement | null;
      if (endingNext) { endingNext.disabled = false; endingNext.classList.remove('is-hidden'); endingNext.textContent = 'ДАЛЕЕ →'; }
      document.getElementById('ending-credits-overlay')?.remove();
      const creditsVideo = document.getElementById('ending-credits-video') as HTMLVideoElement | null;
      if (creditsVideo) { creditsVideo.pause(); try { creditsVideo.currentTime = 0; } catch { /* ignore media teardown */ } }
      endingCreditsOverlay = null;
      if (endingCreditsTimer !== null) { window.clearTimeout(endingCreditsTimer); endingCreditsTimer = null; }
      excellentEndingIndex = 0; excellentEndingBeats = []; excellentEndingTransition = false;

      // A replay is a fresh run: reset the intro/disclaimer one-shot guards and
      // restore the character-selection portraits to their neutral sprites.
      introVideoInProgress = false;
      introVideoFinished = false;
      introVideoShown = false;
      cameoActive = false; cameoPlayed = false; cameoBeatIndex = 0;
      arthurGreetingSoundPlayed = false;
      document.getElementById('cameo-overlay')?.classList.add('is-hidden');
      document.getElementById('cameo-overlay')?.setAttribute('aria-hidden', 'true');
      activeEmotion = 'normal';
      applyCharacterEmotion('normal');

      // Stop all audio belonging to the previous run. Achievement/progression storage is intentionally untouched.
      if (musicFadeTimer !== undefined) { window.clearInterval(musicFadeTimer); musicFadeTimer = undefined; }
      if (archetypeMusicFadeTimer !== undefined) { window.clearInterval(archetypeMusicFadeTimer); archetypeMusicFadeTimer = undefined; }
      if (corridorFadeTimer !== undefined) { window.clearInterval(corridorFadeTimer); corridorFadeTimer = undefined; }
      if (classroomMusicFadeTimer !== undefined) { window.clearInterval(classroomMusicFadeTimer); classroomMusicFadeTimer = undefined; }
      archetypeMusic.pause(); archetypeMusic.currentTime = 0; archetypeMusic.volume = 0;
      if (corridorAmbience) { corridorAmbience.pause(); corridorAmbience.currentTime = 0; }
      classroomMusic.pause(); classroomMusic.currentTime = 0; classroomMusic.volume = 0;
      endingMusic.pause(); endingMusic.currentTime = 0;
      hideNowPlaying();
      // Invoke playback before the first await, within the button click gesture.
      void startIntroMusic();

      // Reset this playthrough only. Do NOT clear achievements, HESOYAM unlocks, or other persistent progress.
      lockedArchetype = null;
      corridorMusicStarted = false;
      corridorRunStartedAt = 0;
      endingRunDurationMs = 0;
      corridorIndex = 0; corridorChoiceMade = false;
      preparedFriendFor = null;
      corridorBeats = []; corridorFriend = { key: 'female1', gender: 'female', folder: 'student_girl1' };
      teacherFatigue = 0; teacherRelationship = 50; teacherBeats = []; teacherBeatIndex = 0;
      teacherChoiceMade = false; teacherSceneBusy = false;
      examQuestionIndex = 0; examCorrectCount = 0; examHintsUsed = 0; examCheatAttempts = 0;
      examPhase = 'question'; examFeedbackLines = []; examFeedbackIndex = 0;
      examQuestionCheatStart = 0; examAnswerOrders = []; examQuestionRude = false; examStarted = false;
      skills = { knowledge: 0, logic: 0, charisma: 0, cunning: 0, confidence: 0, attention: 0 };
      gameStorage.removeItem(SKILLS_KEY);
      renderSkills();

      // Reuse the regular character-selection transition so the page is visibly restored,
      // rather than only toggling a class underneath the final-result overlay.
      isTransitioning = true;
      transitionOverlay?.classList.add('is-active');
      await wait(350);
      showScreen('character');
      // showScreen/renderSelection can run while the previous scene's emotion is still
      // cached; explicitly apply neutral again after rendering the fresh selection screen.
      activeEmotion = 'normal';
      applyCharacterEmotion('normal');
      renderSelection();
      characterScreen?.classList.add('screen-entering');
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      characterScreen?.classList.remove('screen-entering');
      transitionOverlay?.classList.remove('is-active');
      // Reveal the fresh character-selection screen with a smooth fade instead of a hard cut.
      replayFade.style.opacity = '0';
      await wait(450);
      replayFade.remove();
      await wait(100);
      isTransitioning = false;
    }, true)
  );
  overlay.append(background, book);
  document.body.appendChild(overlay);
  document.body.appendChild(buttons);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
}
let preparedCreditsVideo: HTMLVideoElement | null = null;
function prepareCreditsVideo(): HTMLVideoElement {
  if (!preparedCreditsVideo) {
    preparedCreditsVideo = document.createElement('video');
    preparedCreditsVideo.id = 'ending-credits-video';
    preparedCreditsVideo.preload = 'none';
    preparedCreditsVideo.playsInline = true;
    preparedCreditsVideo.src = '/assets/endings/credits.mp4';
  }
  prepareMedia(preparedCreditsVideo);
  return preparedCreditsVideo;
}
function startEndingCredits(): void {
  // Tear down stale DOM and timers without invoking the final-result screen transition.
  if (endingCreditsTimer !== null) { window.clearTimeout(endingCreditsTimer); endingCreditsTimer = null; }
  const staleOverlay = document.getElementById('ending-credits-overlay');
  const staleVideo = staleOverlay?.querySelector('video');
  if (staleVideo) { staleVideo.pause(); try { staleVideo.currentTime = 0; } catch { /* ignore media teardown */ } }
  staleOverlay?.remove();
  endingCreditsOverlay = null;
  const overlay = document.createElement('div');
  overlay.id = 'ending-credits-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Титры игры');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
  });
  void Promise.all(resultAssets.map(source => loadImage(source))).then(() => prepareResultAudio());
  const video = prepareCreditsVideo();
  preparedCreditsVideo = null;
  warmImages([...resultAssets, ...achievementAssets]);
  video.autoplay = true;
  video.controls = false;
  video.playsInline = true;
  // Keep the buffer prepared during the ending.
  // Play the supplied credits video with its original audio.
  video.muted = false;
  video.volume = 1.0;
  Object.assign(video.style, {
    width: '100%', height: '100%', objectFit: 'contain', background: '#000'
  });
  const skip = document.createElement('button');
  skip.id = 'ending-credits-skip';
  skip.type = 'button';
  skip.textContent = 'ПРОПУСТИТЬ  →';
  skip.setAttribute('aria-label', 'Пропустить титры');
  Object.assign(skip.style, {
    position: 'absolute', right: 'max(24px, env(safe-area-inset-right))',
    bottom: 'max(24px, env(safe-area-inset-bottom))', padding: '13px 22px',
    border: '1px solid rgba(255,255,255,.65)', borderRadius: '3px',
    background: 'rgba(0,0,0,.72)', color: '#fff', font: '600 14px Arial, sans-serif',
    letterSpacing: '1.5px', cursor: 'pointer', opacity: '0', pointerEvents: 'none',
    transition: 'opacity .35s ease'
  });
  skip.addEventListener('click', () => finishEndingCredits(false));
  video.addEventListener('ended', () => finishEndingCredits(true), { once: true });
  video.addEventListener('error', () => {
    // If the file cannot be loaded, do not trap the player on a black screen.
    finishEndingCredits();
  }, { once: true });
  overlay.append(video, skip);
  document.body.appendChild(overlay);
  endingCreditsOverlay = overlay;
  endingCreditsTimer = window.setTimeout(() => {
    if (!endingCreditsOverlay || endingCreditsOverlay !== overlay) return;
    skip.style.opacity = '1';
    skip.style.pointerEvents = 'auto';
  }, 20_000);
  const playback = video.play();
  if (playback && typeof playback.catch === 'function') {
    playback.catch(() => {
      // Browsers may block autoplay with audio; if blocked, show native playback controls so the player can start it.
      video.controls = true;
    });
  }
}

async function advanceExcellentEnding(): Promise<void> {
  if (excellentEndingTransition) return;
  const overlay = document.getElementById('excellent-ending');
  const scene = document.getElementById('excellent-ending-scene');
  const next = document.getElementById('excellent-ending-next') as HTMLButtonElement | null;
  if (excellentEndingIndex >= excellentEndingBeats.length - 1) {
    // The ending is terminal: play the credits instead of revealing/resuming the exam.
    if (next) { next.disabled = true; next.textContent = 'КОНЕЦ'; next.classList.add('is-hidden'); }
    endingMusic.pause();
    excellentEndingPhoneSound.stop();
    startEndingCredits();
    return;
  }
  excellentEndingTransition = true;
  if (next) next.disabled = true;
  if (excellentEndingIndex >= excellentEndingBeats.length - 3) prepareCreditsVideo();
  const current = excellentEndingBeats[excellentEndingIndex];
  const upcoming = excellentEndingBeats[excellentEndingIndex + 1];
  const nextReady = Promise.all([readyImages([upcoming.image]), ...(upcoming.speaker.includes('ТЕЛЕФОН') ? [excellentEndingPhoneSound.prepare()] : [])]);
  // After the flashback sequence (first three dialogue beats), hold black for 3 seconds
  // before revealing the present-day classroom.
  const isSpecialArchetypeEnding = excellentEndingBeats[0]?.image.includes('/brave/') || excellentEndingBeats[0]?.image.includes('/trickster/') || excellentEndingBeats[0]?.image.includes('/charisma/') || excellentEndingBeats[0]?.image.includes('/analyst/') || excellentEndingBeats[0]?.image.includes('/observer/') || excellentEndingBeats[0]?.image.includes('/universal/');
  const isBraveEnding = excellentEndingBeats[0]?.image.includes('/brave/');
  const flashbackToClassroom = isBraveEnding ? excellentEndingIndex === 2 : isSpecialArchetypeEnding ? excellentEndingIndex === 1 : excellentEndingIndex === 2;
  if (flashbackToClassroom) {
    overlay?.classList.add('is-blackout');
    await Promise.all([wait(3000), nextReady]);
    excellentEndingIndex++;
    showExcellentEndingBeat();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    overlay?.classList.remove('is-blackout');
    excellentEndingTransition = false;
    if (next) next.disabled = false;
    return;
  }
  if (current?.fade) {
    overlay?.classList.add('is-blackout');
    await Promise.all([wait(3000), nextReady]);
  } else {
    scene?.classList.add('is-fading');
    await Promise.all([wait(420), nextReady]);
  }
  excellentEndingIndex++;
  showExcellentEndingBeat();
  if (current?.fade) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    overlay?.classList.remove('is-blackout');
  }
  excellentEndingTransition = false;
  if (next) next.disabled = false;
}
function startExcellentEnding(correctAnswers: number, endingType: 'brave' | 'trickster' | 'charisma' | 'analyst' | 'observer' | 'universal' | 'excellent' = 'excellent'): void {
  warmImages([...resultAssets, ...achievementAssets]);
  endingRunDurationMs = corridorRunStartedAt > 0 ? Math.max(0, Date.now() - corridorRunStartedAt) : 0;
  const overlay = document.getElementById('excellent-ending');
  if (!overlay) return;
  hideNowPlaying();
  try { archetypeMusic.pause(); } catch { /* audio may not have initialized */ }
  try { classroomMusic.pause(); } catch { /* audio may not have initialized */ }
  if (introMusic) introMusic.pause();
  if (corridorAmbience) corridorAmbience.pause();
  endingMusic.pause(); endingMusic.currentTime = 0;
  void endingMusic.play().catch(() => { /* browser autoplay policy: ending remains playable */ });
  excellentEndingBeats = buildExcellentEndingBeats(correctAnswers, endingType); excellentEndingIndex = 0; excellentEndingTransition = true;
  overlay.classList.add('is-blackout');
  overlay.classList.remove('is-hidden'); overlay.setAttribute('aria-hidden', 'false');
  showExcellentEndingBeat(false);
  const next = document.getElementById('excellent-ending-next') as HTMLButtonElement | null;
  if (next) { next.disabled = false; next.innerHTML = 'ДАЛЕЕ <span>→</span>'; next.onclick = () => { void advanceExcellentEnding(); }; }
  // Three seconds of black before the first frame, followed by a gentle reveal.
  void Promise.all([wait(3000), readyImages([excellentEndingBeats[0].image]), excellentEndingPhoneSound.prepare()]).then(() => {
    overlay.classList.remove('is-blackout');
    if (excellentEndingBeats[excellentEndingIndex]?.speaker.includes('ТЕЛЕФОН')) excellentEndingPhoneSound.play();
    excellentEndingTransition = false;
  });
}
window.addEventListener('game:exam-scene-finished', (event: Event) => {
  const custom = event as CustomEvent<{ correct?: number; isExcellentEnding?: boolean; isTricksterEnding?: boolean; isCharismaEnding?: boolean; isAnalystEnding?: boolean; isBraveEnding?: boolean; isObserverEnding?: boolean; isUniversalEnding?: boolean; archetype?: string; cheatAttempts?: number; teacherFatigue?: number }>;
  // The final results button already validated the archetype. Trust that explicit flag
  // so a stale/recomputed archetype label cannot block the 0–3 failure ending.
  const achievementCorrect = Number(custom.detail?.correct ?? examCorrectCount);
  if (Number.isFinite(achievementCorrect) && achievementCorrect >= 0 && achievementCorrect <= 7) {
    if (achievementCorrect >= 6) unlockAchievement('history-keeper');
    else if (achievementCorrect >= 4) unlockAchievement('result-first');
    else unlockAchievement('retake-legend');
  }
  if (Number(custom.detail?.cheatAttempts ?? examCheatAttempts) >= 3) unlockAchievement('too-clever');
  const endingArchetypeKey = String(custom.detail?.archetype || examArchetypeKey())
    .normalize('NFC').toLocaleUpperCase('ru-RU');
  const isExcellentArchetype = endingArchetypeKey.includes('ОТЛИЧНИК') || endingArchetypeKey.includes('ОТЛИЧНИЦ');
  const isTricksterArchetype = endingArchetypeKey.includes('ТРИКСТЕР');
  const isCharismaArchetype = endingArchetypeKey.includes('РАЙАН ГОСЛИНГ') || endingArchetypeKey.includes('МЕГАН ФОКС');
  const isAnalystArchetype = endingArchetypeKey.includes('АНАЛИТИК');
  const isBraveArchetype = endingArchetypeKey.includes('СМЕЛЬЧАК') || endingArchetypeKey.includes('СМЕЛАЯ') || endingArchetypeKey.includes('BOLD') || endingArchetypeKey.includes('BRAVE');
  const isObserverArchetype = endingArchetypeKey.includes('НАБЛЮДАТЕЛЬ') || endingArchetypeKey.includes('OBSERVER');
  const isUniversalArchetype = endingArchetypeKey.includes('УНИВЕРСАЛ') || endingArchetypeKey.includes('UNIVERSAL');
  if (!custom.detail?.isExcellentEnding && !isExcellentArchetype && !custom.detail?.isTricksterEnding && !isTricksterArchetype && !custom.detail?.isCharismaEnding && !isCharismaArchetype && !custom.detail?.isAnalystEnding && !isAnalystArchetype && !custom.detail?.isBraveEnding && !isBraveArchetype && !custom.detail?.isObserverEnding && !isObserverArchetype && !custom.detail?.isUniversalEnding && !isUniversalArchetype) return;
  const correct = Number(custom.detail?.correct ?? examCorrectCount);
  // Zero is a valid score: do not use a truthiness check here.
  const endingType: 'brave' | 'trickster' | 'charisma' | 'analyst' | 'observer' | 'universal' | 'excellent' = Boolean(custom.detail?.isUniversalEnding || isUniversalArchetype) ? 'universal' : Boolean(custom.detail?.isObserverEnding || isObserverArchetype) ? 'observer' : Boolean(custom.detail?.isBraveEnding || isBraveArchetype) ? 'brave' : Boolean(custom.detail?.isAnalystEnding || isAnalystArchetype) ? 'analyst' : Boolean(custom.detail?.isCharismaEnding || isCharismaArchetype) ? 'charisma' : Boolean(custom.detail?.isTricksterEnding || isTricksterArchetype) ? 'trickster' : 'excellent';
  if (Number.isFinite(correct) && correct >= 0 && correct <= 7) startExcellentEnding(correct, endingType);
});

renderSelection();
syncMenuAchievementsButton();

setupPhoneOrientation();
document.addEventListener('click', () => {
  if (isPhoneLayout() && mobileClassroomWanted && !cameoActive && classroomMusic.paused) startClassroomMusic();
}, { capture: true });
