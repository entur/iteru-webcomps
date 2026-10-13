import { describe, it, expect } from 'vitest';
import { distillModule, parsePatch } from './distillTypes';

// Minimal generated-like source exercising every rule.
const SRC = `
export type Maybe<T> = T | null;
export type Scalars = { String: { input: string; output: string }; Int: { input: number; output: number }; Float: { input: number; output: number }; Boolean: { input: boolean; output: boolean } };
export enum Mode { Bus = 'BUS', Rail = 'RAIL' }
export type MultilingualString = { lang?: Maybe<Scalars['String']['output']>; value?: Maybe<Scalars['String']['output']> };
export type Cap = { seating?: Maybe<Scalars['Int']['output']>; total?: Maybe<Scalars['Int']['output']> };
export type Rel = { netexId: Scalars['String']['output']; foo?: Maybe<Scalars['String']['output']> };
export type Thing = {
  netexId: Scalars['String']['output'];
  name?: Maybe<MultilingualString>;
  length?: Maybe<Scalars['Float']['output']>;
  lowFloor?: Maybe<Scalars['Boolean']['output']>;
  mode?: Maybe<Mode>;
  cap?: Maybe<Cap>;
  rel?: Maybe<Rel>;
  rels?: Maybe<Array<Rel>>;
  tags?: Maybe<Array<Cap>>;
  version?: Maybe<Scalars['String']['output']>;
};
export type ThingInput = {
  netexId?: Maybe<Scalars['String']['output']>;
  name?: Maybe<MultilingualString>;
  length?: Maybe<Scalars['Float']['output']>;
  lowFloor?: Maybe<Scalars['Boolean']['output']>;
  mode?: Maybe<Mode>;
  cap?: Maybe<Cap>;
  rel?: Maybe<Rel>;
};
`;

describe('distillModule', () => {
  const out = distillModule(SRC, 'Thing', 'ThingInput');

  it('emits the full read interface verbatim (incl. server-managed extras)', () => {
    expect(out).toMatch(/export interface Entity \{/);
    expect(out).toMatch(/version\?: Maybe<Scalars\['String'\]\['output'\]>;/);
  });

  it('maps control kinds and access paths', () => {
    expect(out).toMatch(/name:\s*\{ kind: 'name', path: \['name'\] \}/);
    expect(out).toMatch(/length:\s*\{ kind: 'number', path: \['length'\] \}/);
    expect(out).toMatch(/lowFloor:\s*\{ kind: 'switch', path: \['lowFloor'\] \}/);
    expect(out).toMatch(
      /mode:\s*\{ kind: 'enum', path: \['mode'\], options: Object\.values\(Mode\) \}/
    );
  });

  it('flattens id-less value-objects into leaf fields with 2-element paths', () => {
    expect(out).toMatch(/seating:\s*\{ kind: 'number', path: \['cap', 'seating'\] \}/);
    expect(out).toMatch(/total:\s*\{ kind: 'number', path: \['cap', 'total'\] \}/);
  });

  it('omits single relations (object with identity) from FIELDS but keeps them on Entity', () => {
    expect(out).toMatch(/rel\?: Maybe<Rel>;/); // on the interface
    expect(out).not.toMatch(/rel:\s*\{ kind:/); // not in FIELDS
  });

  it('emits a grid field for an array of identity objects, auto-flagged serverManaged', () => {
    expect(out).toMatch(/rels:\s*\{ kind: 'grid', path: \['rels'\], serverManaged: true \}/);
  });

  it('omits arrays of id-less value-objects (no flat control, no grid)', () => {
    expect(out).toMatch(/tags\?: Maybe<Array<Cap>>;/); // on the interface
    expect(out).not.toMatch(/tags:\s*\{ kind:/); // not in FIELDS
  });

  it('flags server-managed fields (on Entity, not Input)', () => {
    expect(out).toMatch(/version:\s*\{ kind: 'text', path: \['version'\], serverManaged: true \}/);
  });

  it('flags LOCKED_FIELDS (on both Entity and Input) as locked, not serverManaged', () => {
    const withRef = SRC.replace(
      '  version?: Maybe<Scalars[\'String\'][\'output\']>;',
      "  version?: Maybe<Scalars['String']['output']>;\n  dataOwnerRef?: Maybe<Scalars['String']['output']>;"
    ).replace(
      "export type ThingInput = {",
      "export type ThingInput = {\n  dataOwnerRef?: Maybe<Scalars['String']['output']>;"
    );
    const lockedOut = distillModule(withRef, 'Thing', 'ThingInput');
    expect(lockedOut).toMatch(
      /dataOwnerRef:\s*\{ kind: 'text', path: \['dataOwnerRef'\], locked: true \}/
    );
    expect(lockedOut).not.toMatch(/dataOwnerRef:\s*\{[^}]*serverManaged/);
    // Ordinary writable fields are unchanged.
    expect(lockedOut).toMatch(/length:\s*\{ kind: 'number', path: \['length'\] \}/);
  });

  it('imports referenced types + enum values, never the entity/input itself', () => {
    expect(out).toMatch(/import \{ Mode \} from '\.\.\/generated\/sobekTypes';/);
    expect(out).toMatch(/import type \{[^}]*\} from '\.\.\/generated\/sobekTypes';/);
    const importLines = out.split('\n').filter(l => l.startsWith('import'));
    expect(importLines.join('\n')).not.toMatch(/\bThing\b/); // never import the entity/input
  });

  it('aborts when an Input field has no Entity counterpart (write-only)', () => {
    const writeOnly = SRC.replace(
      'export type ThingInput = {',
      "export type ThingInput = {\n  dataOwnerRef?: Maybe<Scalars['String']['output']>;"
    );
    expect(() => distillModule(writeOnly, 'Thing', 'ThingInput')).toThrow(/dataOwnerRef/);
  });
});

// Read-object / write-reference divergence + native date kinds. Separate fixture:
// adds Date/DateTime scalars and a pure-reference Input (`{ netexId }`) for the
// relation — the Vehicle.transportType shape.
const SRC_REF = `
export type Maybe<T> = T | null;
export type Scalars = { String: { input: string; output: string }; Date: { input: string; output: string }; DateTime: { input: string; output: string } };
export type Ref = { netexId: Scalars['String']['output']; label?: Maybe<Scalars['String']['output']> };
export type RefReferenceInput = { netexId: Scalars['String']['input'] };
export type Doc = {
  netexId: Scalars['String']['output'];
  built?: Maybe<Scalars['Date']['output']>;
  changed?: Maybe<Scalars['DateTime']['output']>;
  rel?: Maybe<Ref>;
};
export type DocInput = {
  built?: Maybe<Scalars['Date']['output']>;
  rel?: Maybe<RefReferenceInput>;
};
`;

describe('distillModule — reference divergence + date kinds', () => {
  const out = distillModule(SRC_REF, 'Doc', 'DocInput');

  it('maps Date → date and DateTime → datetime', () => {
    expect(out).toMatch(/built:\s*\{ kind: 'date', path: \['built'\] \}/);
    expect(out).toMatch(
      /changed:\s*\{ kind: 'datetime', path: \['changed'\], serverManaged: true \}/
    );
  });

  it('surfaces a write-reference relation as a `reference` field on the id leaf', () => {
    expect(out).toMatch(/rel:\s*\{ kind: 'reference', path: \['rel', 'netexId'\] \}/);
    expect(out).toMatch(/rel\?: Maybe<Ref>;/); // read relation kept verbatim on Entity
  });

  it('carries `locked` through the reference fast-path', () => {
    // The fast-path `continue`s before deriveFields, so it has to apply `locked`
    // itself — otherwise a LOCKED_FIELDS member that happens to be written as a
    // reference is emitted editable and lands in the write payload.
    const lockedRef = SRC_REF.replace(/\brel\b/g, 'dataOwnerRef');
    const out2 = distillModule(lockedRef, 'Doc', 'DocInput');
    expect(out2).toMatch(
      /dataOwnerRef:\s*\{ kind: 'reference', path: \['dataOwnerRef', 'netexId'\], locked: true \}/
    );
  });
});

describe('patched fields', () => {
  const PATCH = `
    extend type Thing { length: Float cap: Cap }
    extend input ThingInput { length: Float }
    extend type Other { foo: String }
  `;

  it('reads read-type extensions per type, ignoring input extensions', () => {
    const patch = parsePatch(PATCH);
    expect([...patch.keys()]).toEqual(['Thing', 'Other']);
    expect([...patch.get('Thing')!]).toEqual(['length', 'cap']);
  });

  it('marks a patched field, and every leaf hoisted out of a patched object', () => {
    const out = distillModule(SRC, 'Thing', 'ThingInput', parsePatch(PATCH).get('Thing'));
    expect(out).toMatch(/length: \{ kind: 'number', path: \['length'\], patched: true \}/);
    expect(out).toMatch(/seating: \{[^}]*path: \['cap', 'seating'\], patched: true \}/);
    expect(out).toMatch(/total: \{[^}]*patched: true \}/);
    // Nothing else picks the flag up.
    expect(out.match(/patched: true/g)).toHaveLength(3);
  });

  it('marks nothing when the entity has no overlay', () => {
    expect(distillModule(SRC, 'Thing', 'ThingInput')).not.toMatch(/patched/);
  });
});
