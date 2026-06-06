import { eslint } from '@siberiacancode/eslint';

export default eslint({
  typescript: true,
  ignores: ['src/types/*', '*.md'],
  rules: {
    'ts/no-use-before-define': ['off'],
    'no-useless-catch': ['off'],
    'perfectionist/sort-imports': ['warn'],
    'node/prefer-global/buffer': ['error', 'always'],
    'node/prefer-global/process': ['error', 'always'],
    'e18e/prefer-array-to-sorted': ['off'],
    'e18e/ban-dependencies': ['off'],
    'unicorn/number-literal-case': ['off']
  }
});
