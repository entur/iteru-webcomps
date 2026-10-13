import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSchema, parse, visit } from 'graphql';
import { SCHEMA_FILES, buildFilterFieldsModule, buildInputKeysModule } from './generateDocuments';

const SDL = `
  type Query { things(filter: ThingFilter!, page: Int, size: Int): ThingPage }
  type Mutation { createOrUpdateThing(input: ThingInput!): String }
  input ThingFilter { netexIds: [String] }
  type ThingPage { content: [Thing] }
  type Thing { netexId: String, weight: Float, version: String }
  input ThingInput { netexId: String, weight: Float }
`;

const ENTRY = {
  entity: 'Thing',
  queryRoot: 'things',
  mutationName: 'createOrUpdateThing',
  fileName: 'thing',
};

describe('SCHEMA_FILES', () => {
  it('excludes the patch overlay — wire generators read the live schema alone', () => {
    expect(SCHEMA_FILES).not.toContain('./schema/sobek.patch.graphqls');
    expect(SCHEMA_FILES).toContain('./schema/sobek.schema.graphqls');
  });
});

describe('buildInputKeysModule', () => {
  const emit = () => buildInputKeysModule([ENTRY], buildSchema(SDL));

  it('emits one key per member of the entity Input type', () => {
    expect(emit()).toMatch(/export const ThingInputKeys = \{[^}]*netexId: 1[^}]*\}/s);
    expect(emit()).toMatch(/export const ThingInputKeys = \{[^}]*weight: 1[^}]*\}/s);
  });

  it('omits members the Input type does not declare', () => {
    expect(emit()).not.toMatch(/\bversion: 1\b/);
  });

  it('pins the keyset to the generated Input type', () => {
    expect(emit()).toMatch(/import type \{ ThingInput \} from '\.\/thing\.generated';/);
    expect(emit()).toMatch(/\} satisfies Record<keyof ThingInput, 1>;/);
  });
});

/**
 * End-to-end guard on freshly generated output (`pretest` runs `generate`).
 * Every field the patch overlay adds to a manifest entity must be absent from
 * that entity's operation document — this is the assertion the original bug
 * would have failed.
 */
describe('generated documents', () => {
  const patchSdl = readFileSync(resolve('schema/sobek.patch.graphqls'), 'utf8');
  const manifest: { entity: string }[] = JSON.parse(readFileSync(resolve('entities.manifest.json'), 'utf8'));
  const docDir = resolve('src/generated/operations/documents');

  /** `extend type X { a b }` → Map<'X', ['a','b']> (read half only). */
  const patched = new Map<string, string[]>();
  visit(parse(patchSdl), {
    ObjectTypeExtension(node) {
      patched.set(
        node.name.value,
        (node.fields ?? []).map(f => f.name.value)
      );
    },
  });

  const covered = manifest.filter(m => patched.has(m.entity));

  it('has at least one patched entity to check', () => {
    expect(covered.length).toBeGreaterThan(0);
  });

  it.each(covered.map(m => m.entity))('%s document selects no patch-only field', entity => {
    const file = readdirSync(docDir).find(
      f => f.toLowerCase() === `${entity.toLowerCase()}.graphql`
    );
    expect(file, `no generated document for ${entity}`).toBeDefined();
    const doc = readFileSync(resolve(docDir, file!), 'utf8');
    for (const field of patched.get(entity)!) {
      expect(doc, `${entity}.graphql selects patch-only field "${field}"`).not.toMatch(
        new RegExp(`^\\s*${field}\\b`, 'm')
      );
    }
  });
});

const FILTER_SDL = `
  type Query { things(filter: ThingFilter, page: Int, size: Int): ThingPage }
  input ThingFilter {
    netexIds: [String!]
    modes: [String!]
    name: String
    dataOwnerRef: String!
    onlyMine: Boolean
  }
  type ThingPage { content: [Thing] }
  type Thing { netexId: String, mode: String, name: String, dataOwnerRef: String }
`;

describe('buildFilterFieldsModule', () => {
  const emit = () => buildFilterFieldsModule([ENTRY], buildSchema(FILTER_SDL));

  it('maps a same-named scalar filter arg to a contains condition', () => {
    expect(emit()).toContain(`name: { arg: 'name', op: 'contains' },`);
  });

  it('maps a list-typed plural arg onto the singular entity field as anyOf', () => {
    expect(emit()).toContain(`netexId: { arg: 'netexIds', op: 'anyOf' },`);
    expect(emit()).toContain(`mode: { arg: 'modes', op: 'anyOf' },`);
  });

  it('excludes dataOwnerRef: session context, never a user choice', () => {
    expect(emit()).not.toMatch(/dataOwnerRef/);
  });

  it('skips a filter arg with no matching entity field', () => {
    expect(emit()).not.toMatch(/onlyMine/);
  });

  it('names the export after the entity and freezes it', () => {
    expect(emit()).toMatch(/export const ThingFilterFields = \{\n(  \w+: \{[^}]*\},\n)+\} as const;/);
  });

  describe('arg typing and plural forms', () => {
    const SDL2 = `
      type Query { things(filter: ThingFilter): [Thing] }
      enum Mode { bus rail }
      input ThingFilter {
        categories: [String!]
        fareClasses: [Mode!]
        lowFloor: Boolean
        version: Int
        mode: Mode
        weights: [Float!]
      }
      type Thing { category: String, fareClass: Mode, lowFloor: Boolean, version: Int, mode: Mode, weight: Float }
    `;
    const emit2 = () => buildFilterFieldsModule([ENTRY], buildSchema(SDL2));

    it('singularises -ies and -es plurals', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(emit2()).toContain(`category: { arg: 'categories', op: 'anyOf' },`);
      expect(emit2()).toContain(`fareClass: { arg: 'fareClasses', op: 'anyOf' },`);
      warn.mockRestore();
    });

    it('offers no text filter for a non-String scalar arg', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = emit2();
      expect(out).not.toMatch(/lowFloor|version|mode:|weight/);
      warn.mockRestore();
    });

    it('warns about every filter arg it could not offer', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      emit2();
      const said = warn.mock.calls.map(c => String(c[0])).join('\n');
      ['lowFloor', 'version', 'mode', 'weights'].forEach(arg => expect(said).toContain(arg));
      expect(said).not.toContain('categories');
      warn.mockRestore();
    });
  });

  it('throws when the query root takes no filter input', () => {
    const sdl = `type Query { things: [Thing] } type Thing { netexId: String }`;
    expect(() => buildFilterFieldsModule([ENTRY], buildSchema(sdl))).toThrow(/filter/);
  });
});
