/** Keep all phone-specific behavior behind the same query as mobile.css. */
const phoneQuery = window.matchMedia('(pointer: coarse) and (max-width: 1100px)');
export const isPhoneLayout = () => phoneQuery.matches;

export function setupPhoneOrientation(): void {
  const portrait = window.matchMedia('(orientation: portrait)');
  const update = () => {
    const blocked = phoneQuery.matches && portrait.matches;
    const overlay = document.getElementById('orientation-overlay');
    overlay?.setAttribute('aria-hidden', String(!blocked));
    if (phoneQuery.matches) overlay?.setAttribute('role', 'status');
    document.querySelector('main')?.toggleAttribute('inert', blocked);
  };
  portrait.addEventListener('change', update);
  phoneQuery.addEventListener('change', update);
  update();
}
