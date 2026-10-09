module.exports = {
  displayName: true,
  classNameSlug: '[title]__[name]__[hash]',
  // The theme modules export plain static values (strings/numbers/objects) via
  // the notCss() helper. Teach wyw's hybrid static evaluator to treat that helper
  // as a pure passthrough, so `style.*` interpolations resolve without executing
  // the full module graph. (Same trust model as importOverrides: this helper is
  // deterministic and returns its argument unchanged.) Keys are tried both as
  // written in the source and as resolved paths.
  staticBindings: {
    './util': {
      notCss: (object) => object,
    },
    './src/app/style/util': {
      notCss: (object) => object,
    },
  },
}
