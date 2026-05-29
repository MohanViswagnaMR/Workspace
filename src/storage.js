/* =========================================================================
   storage.js — workspace persistence
   =========================================================================
   loadStore / saveStore   — personal workspace (one doc per user)
   registerUser            — write user profile for email discoverability
   searchUsersByEmail      — find registered users by email prefix
   shareWorkspaceWithUser  — share a workspace snapshot + send notification
   loadSharedWorkspaces    — workspaces shared with this user
   loadNotifications       — inbox items for this user
   markNotificationRead    — mark one notification as read
   ========================================================================= */
import {
  doc, getDoc, setDoc, collection,
  query, where, getDocs, addDoc, updateDoc, deleteDoc,
  orderBy, limit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase.js';

/* ---------------------------------------------------------------- load --- */
export async function loadStore(uid) {
  if (!isFirebaseConfigured || !db || !uid) return null;
  const snap = await getDoc(doc(db, 'workspaces', uid));
  if (snap.exists()) {
    return snap.data()?.store ?? null;
  }
  return null;
}

/* ---------------------------------------------------------------- save --- */
let saveTimer = null;

export function saveStore(uid, state) {
  if (!isFirebaseConfigured || !db || !uid) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await setDoc(doc(db, 'workspaces', uid), {
        store: state,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('[storage] Firestore save failed:', err);
    }
  }, 700);
}

/* ------------------------------------------------- user registry --------- */
export async function registerUser(uid, { email, displayName, photoURL }) {
  if (!isFirebaseConfigured || !db || !uid) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: email || '',
      displayName: displayName || '',
      photoURL: photoURL || null,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.error('[storage] registerUser failed:', err);
  }
}

/* ------------------------------------------ email search ---------------- */
export async function searchUsersByEmail(emailQuery, excludeUid) {
  if (!isFirebaseConfigured || !db || !emailQuery || emailQuery.length < 2) return [];
  try {
    const q = query(
      collection(db, 'users'),
      where('email', '>=', emailQuery.toLowerCase()),
      where('email', '<=', emailQuery.toLowerCase() + ''),
      limit(6),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data())
      .filter(u => u.uid !== excludeUid);
  } catch (err) {
    console.error('[storage] searchUsersByEmail failed:', err);
    return [];
  }
}

/* --------------------------------------- workspace sharing -------------- */
export async function shareWorkspaceWithUser(
  { wsId, wsName, ownerId, ownerEmail, ownerDisplayName, snapshot },
  { uid: targetUid, email: targetEmail, role },
) {
  if (!isFirebaseConfigured || !db) throw new Error('Firebase not configured');
  const wsRef = doc(db, 'sharedWorkspaces', wsId);
  const existing = await getDoc(wsRef);
  const prevMembers = existing.exists() ? (existing.data().members || []) : [];
  const filtered = prevMembers.filter(m => m.uid !== targetUid);
  const members = [...filtered, { uid: targetUid, email: targetEmail, role, addedAt: Date.now() }];
  await setDoc(wsRef, {
    id: wsId,
    wsName,
    ownerId,
    ownerEmail,
    ownerDisplayName: ownerDisplayName || ownerEmail,
    members,
    membersUids: members.map(m => m.uid),
    snapshot,
    updatedAt: Date.now(),
  }, { merge: true });
  // send inbox notification to recipient
  await addDoc(collection(db, 'notifications', targetUid, 'items'), {
    type: 'workspace_invite',
    fromEmail: ownerEmail,
    fromName: ownerDisplayName || ownerEmail,
    wsId,
    wsName,
    role,
    at: Date.now(),
    read: false,
  });
}

/* -------------------------------- load shared workspaces --------------- */
export async function loadSharedWorkspaces(uid) {
  if (!isFirebaseConfigured || !db || !uid) return [];
  try {
    const q = query(
      collection(db, 'sharedWorkspaces'),
      where('membersUids', 'array-contains', uid),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.error('[storage] loadSharedWorkspaces failed:', err);
    return [];
  }
}

/* --------------------------------------- notifications ----------------- */
export async function loadNotifications(uid) {
  if (!isFirebaseConfigured || !db || !uid) return [];
  try {
    const q = query(
      collection(db, 'notifications', uid, 'items'),
      orderBy('at', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (err) {
    console.error('[storage] loadNotifications failed:', err);
    return [];
  }
}

/* -------------------------------- delete shared workspace --------------- */
export async function deleteSharedWorkspace(wsId) {
  if (!isFirebaseConfigured || !db || !wsId) return;
  try {
    await deleteDoc(doc(db, 'sharedWorkspaces', wsId));
  } catch (err) {
    console.error('[storage] deleteSharedWorkspace failed:', err);
  }
}

/* ----------------------- transfer workspace ownership ------------------- */
export async function transferWorkspaceOwnership(wsId, newOwner, oldOwnerUid) {
  if (!isFirebaseConfigured || !db || !wsId) return;
  const wsRef = doc(db, 'sharedWorkspaces', wsId);
  const snap = await getDoc(wsRef);
  if (!snap.exists()) return;
  const data = snap.data();
  // Remove new owner from members (they become owner) and drop old owner entirely
  const remainingMembers = (data.members || []).filter(
    m => m.uid !== newOwner.uid && m.uid !== oldOwnerUid,
  );
  // Keep new owner UID in membersUids so they can still query for this workspace
  const membersUids = [newOwner.uid, ...remainingMembers.map(m => m.uid)];
  await setDoc(wsRef, {
    ...data,
    ownerId: newOwner.uid,
    ownerEmail: newOwner.email,
    ownerDisplayName: newOwner.displayName || newOwner.email,
    members: remainingMembers,
    membersUids,
    updatedAt: Date.now(),
  });
  // Notify the new owner
  await addDoc(collection(db, 'notifications', newOwner.uid, 'items'), {
    type: 'ownership_transfer',
    fromEmail: data.ownerEmail,
    fromName: data.ownerDisplayName || data.ownerEmail,
    wsId,
    wsName: data.wsName,
    at: Date.now(),
    read: false,
  });
}

export async function markNotificationRead(uid, notifId) {
  if (!isFirebaseConfigured || !db) return;
  try {
    await updateDoc(doc(db, 'notifications', uid, 'items', notifId), { read: true });
  } catch (err) {
    console.error('[storage] markNotificationRead failed:', err);
  }
}
