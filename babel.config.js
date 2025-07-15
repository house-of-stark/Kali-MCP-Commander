export default {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
};
