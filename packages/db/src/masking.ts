// Client-facing attribution masking. For a client-role viewer of a project, every
// team-member actor identity is shown under one "face" user. The real actor is always
// what the database stores; this rewrites the identity at the read/serialize layer and
// at notification render time only. Kept in @repo/db so the api, worker and bot can all
// import it.

export interface FaceIdentity {
  userId: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export interface MaskableActor {
  actorUserId: string | null;
  actorName: string | null;
}

// Rewrites a row's actor id and name together to the face when masking applies.
// isActorMaskable is the caller's decision: true when the actor must be hidden from a
// client (every non-null actor that is not a current client member). A null actor (a
// system write) is never masked. id and name are swapped together because an avatar is
// looked up by the id. Fails closed: when the actor is maskable but no face resolves,
// the actor is suppressed (id and name null) rather than revealed, and the client sees
// the existing null/system placeholder instead of the real person.
export function maskActor<T extends MaskableActor>(
  row: T,
  face: FaceIdentity | null,
  isActorMaskable: boolean,
): T {
  if (!isActorMaskable || row.actorUserId == null) return row;
  if (!face) return { ...row, actorUserId: null, actorName: null };
  return { ...row, actorUserId: face.userId, actorName: face.name };
}
