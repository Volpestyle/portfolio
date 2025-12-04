import { defaultSchema } from 'hast-util-sanitize';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

const baseAttributes = defaultSchema.attributes ?? {};

export const markdownSanitizeSchema: RehypeSanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...baseAttributes,
    code: [...(baseAttributes.code ?? []), ['className', /^language-[a-z0-9-]+$/i]],
    span: [...(baseAttributes.span ?? []), ['className', /^token[\w-]*$/i]],
    img: [...(baseAttributes.img ?? []), ['className'], ['data-src'], ['data-path']],
    a: [...(baseAttributes.a ?? []), ['className'], ['target'], ['rel']],
  },
};
