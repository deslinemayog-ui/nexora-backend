import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBjRi92-GpP71HcBUUXknw3vPhX3lSh7dk',
  authDomain: 'nexora-d7346.firebaseapp.com',
  projectId: 'nexora-d7346',
  storageBucket: 'nexora-d7346.firebasestorage.app',
  messagingSenderId: '48359839120',
  appId: '1:48359839120:web:d6d75b0ff4e769c9ac0f15',
};

// Initialize Firebase once
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export interface CandidateDossier {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  cvFileName?: string;
  cvFileSize?: number;
  cvFileDataUrl?: string;
  portfolioUrl?: string;
  notes?: string;
  prereqFields?: Record<string, string>;
  updatedAt?: string;
}

export interface FirebaseTaskRecord {
  id?: string;
  userId: string;
  conversationId: string;
  title: string;
  agentType: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SUBMITTED';
  lastMessageSnippet?: string;
  messages?: any[];
  candidate?: CandidateDossier;
  targets?: any[];
  createdAt?: string;
  updatedAt?: string;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function syncFirebaseUserProfile(user: User): Promise<void> {
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(
      userRef,
      stripUndefinedDeep({
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || user.email?.split('@')[0] || 'Nexora User',
        photoURL: user.photoURL || null,
        lastLoginAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (err) {
    console.error('Firestore users sync failed (check Firestore Rules):', err);
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncFirebaseUserProfile(result.user);
  return result.user;
}

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  await syncFirebaseUserProfile(result.user);
  return result.user;
}

export async function registerWithEmail(email: string, pass: string, displayName?: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && result.user) {
    await updateProfile(result.user, { displayName });
  }
  await syncFirebaseUserProfile(result.user);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      syncFirebaseUserProfile(user).catch(() => undefined);
    }
    callback(user);
  });
}

/**
 * Persist candidate dossier & CV metadata to Firebase Firestore
 */
export async function saveCandidateDossier(userId: string, dossier: CandidateDossier): Promise<void> {
  try {
    localStorage.setItem(`nexora_candidate_${userId}`, JSON.stringify(dossier));
  } catch {}

  try {
    const userDocRef = doc(db, 'candidates', userId);
    // Remove large base64 from firestore document if > 500KB to stay within document limit
    const cleanDossier = stripUndefinedDeep({ ...dossier });
    if (cleanDossier.cvFileDataUrl && cleanDossier.cvFileDataUrl.length > 500000) {
      delete cleanDossier.cvFileDataUrl;
    }
    await setDoc(userDocRef, { ...cleanDossier, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('Could not save candidate to Firestore:', err);
  }
}

/**
 * Load saved candidate dossier & form fields from Firestore (with localStorage fallback)
 */
export async function loadCandidateDossier(userId: string): Promise<CandidateDossier | null> {
  try {
    const snap = await getDoc(doc(db, 'candidates', userId));
    if (snap.exists()) {
      return snap.data() as CandidateDossier;
    }
  } catch (err) {
    console.warn('Could not load candidate from Firestore (checking localStorage):', err);
  }

  try {
    const raw = localStorage.getItem(`nexora_candidate_${userId}`);
    if (raw) {
      return JSON.parse(raw) as CandidateDossier;
    }
  } catch {}
  return null;
}

/**
 * Create a new background task on Firebase Firestore
 */
export async function createFirebaseTask(task: FirebaseTaskRecord): Promise<string> {
  const taskId = task.id || `task-${Date.now()}`;
  try {
    const taskDocRef = doc(db, 'tasks', taskId);
    const cleanTask = stripUndefinedDeep({ ...task, id: taskId });
    if (cleanTask.candidate?.cvFileDataUrl && cleanTask.candidate.cvFileDataUrl.length > 500000) {
      cleanTask.candidate = { ...cleanTask.candidate };
      delete cleanTask.candidate.cvFileDataUrl;
    }
    await setDoc(
      taskDocRef,
      {
        ...cleanTask,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('Could not create Firestore task document:', err);
  }
  return taskId;
}

export async function loadUserFirebaseTasks(userId: string): Promise<FirebaseTaskRecord[]> {
  if (!userId || userId === 'guest-user') return [];
  try {
    const q = query(collection(db, 'tasks'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirebaseTaskRecord, 'id'>) }));
    return items.sort((a, b) => {
      const ta = typeof a.updatedAt === 'string' ? Date.parse(a.updatedAt) : 0;
      const tb = typeof b.updatedAt === 'string' ? Date.parse(b.updatedAt) : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
  } catch (err) {
    console.error('Could not load tasks from Firestore:', err);
    return [];
  }
}

/**
 * Delete all Firestore tasks & candidate dossier records for a user
 */
export async function clearUserFirestoreData(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`nexora_candidate_${userId}`);
  } catch {}

  try {
    await deleteDoc(doc(db, 'candidates', userId));
    const q = query(collection(db, 'tasks'), where('userId', '==', userId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (err) {
    console.warn('Could not clear Firestore data:', err);
  }
}

export { onAuthStateChanged, type User };
