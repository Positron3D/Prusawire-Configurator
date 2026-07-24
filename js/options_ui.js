// ABOUTME: Renders the manifest's configOptions into the config panel and
// ABOUTME: reports user selections back through a change callback.

/**
 * Render option widgets from a manifest configOptions map into `container`.
 * Selection options render as radio lists (`type: "radio"`, the default) or
 * a `<select>` (`type: "dropdown"`); `type: "bool"` renders a checkbox.
 * Unknown types fall back to radio with a console warning so newer manifests
 * degrade gracefully. Option-level `description` renders as a section note;
 * choice-level `description` becomes the label's tooltip.
 *
 * Returns { setValues(config) } for syncing the widgets to a config map.
 * onChange(optionId, value) fires for every user edit.
 */
export function renderOptions(configOptions, container, onChange) {
    container.textContent = '';
    const inputsByOption = new Map();

    for (const [optId, body] of Object.entries(configOptions || {})) {
        const section = document.createElement('section');
        section.className = 'config-section';

        const h3 = document.createElement('h3');
        h3.textContent = body.label || optId;
        section.appendChild(h3);

        if (body.description) {
            const note = document.createElement('p');
            note.className = 'section-note';
            note.textContent = body.description;
            section.appendChild(note);
        }

        if (body.type === 'bool') {
            const group = document.createElement('div');
            group.className = 'option-group';
            const label = document.createElement('label');
            label.className = 'option checkbox';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(body.default);
            input.addEventListener('change', () => onChange(optId, input.checked));
            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${body.label || optId}`));
            group.appendChild(label);
            section.appendChild(group);
            inputsByOption.set(optId, { kind: 'bool', input });
        } else if (body.type === 'dropdown') {
            const select = document.createElement('select');
            for (const choice of body.choices || []) {
                const opt = document.createElement('option');
                opt.value = choice.id;
                opt.textContent = choice.label || choice.id;
                if (choice.description) opt.title = choice.description;
                select.appendChild(opt);
            }
            select.addEventListener('change', () => onChange(optId, select.value));
            section.appendChild(select);
            inputsByOption.set(optId, { kind: 'select', input: select });
        } else {
            if (body.type && body.type !== 'radio') {
                console.warn(`Unknown option type "${body.type}" for "${optId}" — rendering as radio.`);
            }
            const group = document.createElement('div');
            group.className = 'option-group';
            const radios = [];
            for (const choice of body.choices || []) {
                const label = document.createElement('label');
                label.className = 'option';
                if (choice.description) label.title = choice.description;
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = `opt-${optId}`;
                input.value = choice.id;
                input.addEventListener('change', () => {
                    if (input.checked) onChange(optId, choice.id);
                });
                label.appendChild(input);
                label.appendChild(document.createTextNode(` ${choice.label || choice.id}`));
                group.appendChild(label);
                radios.push(input);
            }
            section.appendChild(group);
            inputsByOption.set(optId, { kind: 'radio', radios });
        }

        container.appendChild(section);
    }

    return {
        setValues(config) {
            for (const [optId, widget] of inputsByOption) {
                const value = config[optId];
                if (widget.kind === 'bool') {
                    widget.input.checked = Boolean(value);
                } else if (widget.kind === 'select') {
                    if (value != null) widget.input.value = value;
                } else {
                    for (const radio of widget.radios) {
                        radio.checked = radio.value === value;
                    }
                }
            }
        },
    };
}
