import { describe, it, expect } from 'bun:test';
import { maskActor, type FaceIdentity, type MaskableActor } from '@repo/db';
import { clientPermissions, hasPermission } from '../../permissions';

// Unit test: maskActor (the pure swap of actor id + name to the face) and
// clientPermissions (the client role's matrix). Both are pure, no session/HTTP/DB.

const face: FaceIdentity = { userId: 'face', name: 'Face', image: null, username: 'face' };

describe('maskActor', () => {
  it('swaps id and name to the face when the actor is maskable', () => {
    const row = { actorUserId: 'teammate', actorName: 'Teammate' };
    expect(maskActor(row, face, true)).toEqual({ actorUserId: 'face', actorName: 'Face' });
  });

  it('leaves the row alone when the actor is not maskable', () => {
    const row = { actorUserId: 'teammate', actorName: 'Teammate' };
    expect(maskActor(row, face, false)).toBe(row);
  });

  it('never masks a null actor (a system write)', () => {
    const row = { actorUserId: null, actorName: null };
    expect(maskActor(row, face, true)).toBe(row);
  });

  it('fails closed: a maskable actor with no face is suppressed, not revealed', () => {
    const row: MaskableActor = { actorUserId: 'teammate', actorName: 'Teammate' };
    expect(maskActor(row, null, true)).toEqual({ actorUserId: null, actorName: null });
  });

  it('leaves a non-maskable actor alone even when there is no face', () => {
    const row: MaskableActor = { actorUserId: 'teammate', actorName: 'Teammate' };
    expect(maskActor(row, null, false)).toBe(row);
  });
});

describe('clientPermissions', () => {
  it('grants reading work items, documents and initiatives', () => {
    const p = clientPermissions();
    expect(hasPermission(p, 'work_items', 'read')).toBe(true);
    expect(hasPermission(p, 'work_items', 'create')).toBe(true);
    expect(hasPermission(p, 'work_items', 'edit')).toBe(true);
    expect(hasPermission(p, 'documents', 'read')).toBe(true);
    expect(hasPermission(p, 'initiatives', 'read')).toBe(true);
  });

  it('denies dashboards, work-item deletion and member management', () => {
    const p = clientPermissions();
    expect(hasPermission(p, 'dashboards', 'read')).toBe(false);
    expect(hasPermission(p, 'work_items', 'delete')).toBe(false);
    expect(hasPermission(p, 'members_manage', 'read')).toBe(false);
    expect(hasPermission(p, 'documents', 'edit')).toBe(false);
  });
});
