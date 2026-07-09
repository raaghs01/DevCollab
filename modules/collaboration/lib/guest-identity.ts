const STORAGE_KEY = "devcollab-guest-id";

// F8.3: guest edits are attributed to "Guest" with a random color — random
// per guest, not one shared "Guest" identity for every unauthenticated
// visitor. Persisted in sessionStorage so a reload doesn't reassign a new
// color/name mid-session.
export function getGuestIdentity(): { id: string; name: string } {
  if (typeof window === "undefined") {
    return { id: "guest", name: "Guest" };
  }

  let guestId = window.sessionStorage.getItem(STORAGE_KEY);
  if (!guestId) {
    guestId = `guest-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(STORAGE_KEY, guestId);
  }

  return { id: guestId, name: `Guest-${guestId.slice(6)}` };
}
