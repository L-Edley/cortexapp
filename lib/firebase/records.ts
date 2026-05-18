import type { CortexRecord, CortexRecordType } from "@/lib/types";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  type DocumentData,
  type Unsubscribe,
  type QuerySnapshot,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./client";
import { getCurrentUser } from "./auth";

function getRecordsCollection() {
  const user = getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado");
  return collection(getDb(), "users", user.uid, "records");
}

function recordToFirestore(record: CortexRecord): DocumentData {
  return {
    ...record,
    createdAt: Timestamp.fromDate(new Date(record.createdAt)),
    dueDate: record.dueDate
      ? Timestamp.fromDate(new Date(record.dueDate))
      : null,
  };
}

function firestoreToRecord(id: string, data: DocumentData): CortexRecord {
  return {
    id,
    type: data.type,
    title: data.title,
    description: data.description,
    priority: data.priority,
    project: data.project ?? null,
    amount: data.amount ?? null,
    category: data.category ?? null,
    dueDate: data.dueDate
      ? data.dueDate.toDate().toISOString()
      : null,
    nextAction: data.nextAction,
    status: data.status,
    createdAt: data.createdAt
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString(),
  };
}

export async function saveRecord(record: CortexRecord): Promise<void> {
  const recordsCol = getRecordsCollection();
  await setDoc(doc(recordsCol, record.id), recordToFirestore(record));
}

export async function getRecords(): Promise<CortexRecord[]> {
  const recordsCol = getRecordsCollection();
  const snapshot = await getDocs(
    query(recordsCol, orderBy("createdAt", "desc"))
  );
  return snapshot.docs.map((d) => firestoreToRecord(d.id, d.data()));
}

export async function getRecordById(id: string): Promise<CortexRecord | null> {
  const recordsCol = getRecordsCollection();
  const snapshot = await getDoc(doc(recordsCol, id));
  if (!snapshot.exists()) return null;
  return firestoreToRecord(snapshot.id, snapshot.data());
}

export async function getRecordsByType(
  type: CortexRecordType
): Promise<CortexRecord[]> {
  const recordsCol = getRecordsCollection();
  const snapshot = await getDocs(
    query(
      recordsCol,
      where("type", "==", type),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map((d) => firestoreToRecord(d.id, d.data()));
}

export async function updateRecord(
  id: string,
  patch: Partial<CortexRecord>
): Promise<void> {
  const recordsCol = getRecordsCollection();
  const data: Record<string, unknown> = { ...patch };
  if (patch.createdAt) {
    data.createdAt = Timestamp.fromDate(new Date(patch.createdAt));
  }
  if (patch.dueDate !== undefined) {
    data.dueDate = patch.dueDate
      ? Timestamp.fromDate(new Date(patch.dueDate))
      : null;
  }
  const ref = doc(recordsCol, id);
  await setDoc(ref, data, { merge: true });
}

export async function deleteRecord(id: string): Promise<void> {
  const recordsCol = getRecordsCollection();
  await deleteDoc(doc(recordsCol, id));
}

export async function clearRecords(): Promise<void> {
  const recordsCol = getRecordsCollection();
  const snapshot = await getDocs(recordsCol);
  const batch = writeBatch(getDb());
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export function subscribeRecords(
  callback: (records: CortexRecord[]) => void
): Unsubscribe {
  const user = getCurrentUser();
  if (!user) {
    callback([]);
    return () => {};
  }
  const recordsCol = collection(
    getDb(),
    "users",
    user.uid,
    "records"
  );
  const q = query(recordsCol, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot: QuerySnapshot) => {
    const records = snapshot.docs.map((d) =>
      firestoreToRecord(d.id, d.data())
    );
    callback(records);
  });
}

export function subscribeRecordsByType(
  type: CortexRecordType,
  callback: (records: CortexRecord[]) => void
): Unsubscribe {
  const user = getCurrentUser();
  if (!user) {
    callback([]);
    return () => {};
  }
  const recordsCol = collection(
    getDb(),
    "users",
    user.uid,
    "records"
  );
  const q = query(
    recordsCol,
    where("type", "==", type),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot: QuerySnapshot) => {
    const records = snapshot.docs.map((d) =>
      firestoreToRecord(d.id, d.data())
    );
    callback(records);
  });
}

export async function migrateFromLocal(
  records: CortexRecord[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const record of records) {
    try {
      await saveRecord(record);
      success++;
    } catch {
      failed++;
    }
  }
  return { success, failed };
}
