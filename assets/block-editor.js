(function (wp) {
  if (!wp || !wp.blocks || !wp.element || !wp.components) {
    return;
  }

  const { registerBlockType } = wp.blocks;
  const { Fragment, createElement: el } = wp.element;
  const { __ } = wp.i18n || ((text) => text);
  const blockEditor = wp.blockEditor || wp.editor;
  const { InspectorControls } = blockEditor || {};
  const { PanelBody, TextControl, TextareaControl } = wp.components;

  const definitions = Array.isArray(window.a11ytbBlockDefinitions)
    ? window.a11ytbBlockDefinitions
    : [];

  definitions.forEach((definition) => {
    if (!definition || !definition.id) {
      return;
    }

    const blockName = `a11ytb/${definition.id}`;

    registerBlockType(blockName, {
      title: definition.title || definition.id,
      description: definition.description || '',
      icon: definition.icon || 'universal-access-alt',
      category: 'widgets',
      attributes: {
        label: {
          type: 'string',
          default: definition.defaultLabel || '',
        },
        description: {
          type: 'string',
          default: definition.defaultDescription || '',
        },
      },
      supports: {
        align: ['wide', 'full'],
        anchor: true,
      },
      edit: (props) => {
        const { attributes, setAttributes, className } = props;
        const label =
          attributes.label || definition.defaultLabel || definition.title || definition.id;
        const description = attributes.description || '';
        const helper = definition.description || '';

        const controlsPanel = InspectorControls
          ? el(
              InspectorControls,
              null,
              el(
                PanelBody,
                { title: __('Paramètres du bloc', 'a11ytb'), initialOpen: true },
                el(TextControl, {
                  label: __('Titre affiché', 'a11ytb'),
                  value: attributes.label || '',
                  onChange: (value) => setAttributes({ label: value }),
                }),
                el(TextareaControl, {
                  label: __('Description', 'a11ytb'),
                  value: description,
                  onChange: (value) => setAttributes({ description: value }),
                })
              )
            )
          : null;

        const preview = el(
          'div',
          { className: `${className || ''} a11ytb-block-editor-card`.trim() },
          el('strong', null, label),
          (description || definition.defaultDescription) &&
            el(
              'p',
              { className: 'a11ytb-block-editor-description' },
              description || definition.defaultDescription
            ),
          helper && el('p', { className: 'a11ytb-block-editor-helper' }, helper)
        );

        return el(Fragment, null, controlsPanel, preview);
      },
      save: () => null,
    });
  });
})(window.wp);
