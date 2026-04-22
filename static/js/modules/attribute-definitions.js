const DEFAULT_PREDEFINED_ATTRIBUTE_DEFINITIONS = [
    { key: 'party_a_sign', canonicalLabel: '甲方签字', label: '甲方签字', description: '', group: 'signature' },
    { key: 'party_b_sign', canonicalLabel: '乙方签字', label: '乙方签字', description: '', group: 'signature' },
    { key: 'party_a_seal', canonicalLabel: '甲方盖章', label: '甲方盖章', description: '', group: 'signature' },
    { key: 'party_b_seal', canonicalLabel: '乙方盖章', label: '乙方盖章', description: '', group: 'signature' },
    { key: 'need_doc_number', canonicalLabel: '发文号', label: '发文号', description: '', group: 'meta' },
    { key: 'need_doc_date', canonicalLabel: '文档日期', label: '文档日期', description: '', group: 'meta' },
    { key: 'need_sign_date', canonicalLabel: '签字日期', label: '签字日期', description: '', group: 'meta' }
];

const PREDEFINED_ATTRIBUTE_GROUPS = [
    { id: 'signature', title: '签字盖章' },
    { id: 'meta', title: '日期/编号' }
];

function normalizeText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

export function getDefaultPredefinedAttributeDefinitions() {
    return DEFAULT_PREDEFINED_ATTRIBUTE_DEFINITIONS.map(item => ({ ...item }));
}

export function getPredefinedAttributeDefinitions(config) {
    const overrides = Array.isArray(config?.predefined_attribute_definitions)
        ? config.predefined_attribute_definitions
        : [];

    return DEFAULT_PREDEFINED_ATTRIBUTE_DEFINITIONS.map(definition => {
        const override = overrides.find(item => item && item.key === definition.key) || {};
        return {
            ...definition,
            label: normalizeText(override.label, definition.label),
            description: normalizeText(override.description, '')
        };
    });
}

export function getPredefinedAttributeGroups(config) {
    const definitions = getPredefinedAttributeDefinitions(config);
    return PREDEFINED_ATTRIBUTE_GROUPS.map(group => ({
        ...group,
        items: definitions.filter(item => item.group === group.id)
    }));
}

export function getPredefinedAttributeLabelMap(config) {
    return getPredefinedAttributeDefinitions(config).reduce((result, item) => {
        result[item.key] = item.label;
        return result;
    }, {});
}

export function buildCanonicalRequirementText(attributes) {
    const labels = [];
    const defaults = getDefaultPredefinedAttributeDefinitions();
    defaults.forEach(item => {
        if (attributes?.[item.key] === true) {
            labels.push(item.canonicalLabel);
        }
    });
    return labels.join('、') || '';
}

export function buildDisplayRequirementText(docInfo, config) {
    if (!docInfo) return '无特殊要求';
    const definitions = getPredefinedAttributeDefinitions(config);
    const labels = [];

    definitions.forEach(item => {
        if (docInfo.attributes?.[item.key] === true) {
            labels.push(item.label);
        }
    });

    if (labels.length > 0) {
        return labels.join('、');
    }

    return docInfo.requirement || '无特殊要求';
}

export function getFriendlyCustomDisplayName(key) {
    const match = String(key || '').match(/^custom_\d+_(.+)$/);
    const source = match ? match[1] : String(key || '');
    return source.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function getCustomAttributeDefinitions(config, docInfo = null) {
    const configured = Array.isArray(config?.custom_attribute_definitions)
        ? config.custom_attribute_definitions.map(item => ({
            id: item.id,
            name: normalizeText(item.name, getFriendlyCustomDisplayName(item.id)),
            type: normalizeText(item.type, 'checkbox')
        }))
        : [];

    if (configured.length > 0 || !docInfo?.attributes) {
        return configured;
    }

    const predefinedKeys = new Set(DEFAULT_PREDEFINED_ATTRIBUTE_DEFINITIONS.map(item => item.key));
    return Object.entries(docInfo.attributes)
        .filter(([key, value]) => value === true && !predefinedKeys.has(key))
        .map(([key]) => ({
            id: key,
            name: getFriendlyCustomDisplayName(key),
            type: 'checkbox'
        }));
}

export function buildUploadAttributeSchema(docInfo, config) {
    const schema = [];
    const attributes = docInfo?.attributes || {};
    const definitions = getPredefinedAttributeDefinitions(config).reduce((result, item) => {
        result[item.key] = item;
        return result;
    }, {});

    if (attributes.need_doc_date === true) {
        schema.push({
            type: 'date',
            id: 'docDate',
            name: 'doc_date',
            label: definitions.need_doc_date?.label || '文档日期'
        });
    }

    if (attributes.need_sign_date === true) {
        schema.push({
            type: 'date',
            id: 'signDate',
            name: 'sign_date',
            label: definitions.need_sign_date?.label || '签字日期'
        });
    }

    let signatureRequired = false;
    if (attributes.party_a_sign === true) {
        signatureRequired = true;
        schema.push({
            type: 'text',
            id: 'partyASigner',
            name: 'party_a_signer',
            label: `${definitions.party_a_sign?.label || '甲方签字'}人`,
            placeholder: `请输入${definitions.party_a_sign?.label || '甲方签字'}人`
        });
    }
    if (attributes.party_b_sign === true) {
        signatureRequired = true;
        schema.push({
            type: 'text',
            id: 'partyBSigner',
            name: 'party_b_signer',
            label: `${definitions.party_b_sign?.label || '乙方签字'}人`,
            placeholder: `请输入${definitions.party_b_sign?.label || '乙方签字'}人`
        });
    }
    if (signatureRequired) {
        schema.push({
            type: 'checkbox',
            id: 'noSignature',
            name: 'no_signature',
            label: '不涉及签字',
            inline: true
        });
    }

    const sealOptions = [];
    if (attributes.party_a_seal === true) {
        sealOptions.push({
            id: 'partyASeal',
            name: 'party_a_seal',
            label: definitions.party_a_seal?.label || '甲方盖章'
        });
    }
    if (attributes.party_b_seal === true) {
        sealOptions.push({
            id: 'partyBSeal',
            name: 'party_b_seal',
            label: definitions.party_b_seal?.label || '乙方盖章'
        });
    }
    if (sealOptions.length > 0) {
        schema.push({
            type: 'checkbox_group',
            label: '盖章标记',
            options: sealOptions
        });
        schema.push({
            type: 'checkbox',
            id: 'noSeal',
            name: 'no_seal',
            label: '不涉及盖章',
            inline: true
        });
    }

    if (attributes.need_doc_number === true) {
        schema.push({
            type: 'text',
            id: 'docNumber',
            name: 'doc_number',
            label: definitions.need_doc_number?.label || '发文号',
            placeholder: `请输入${definitions.need_doc_number?.label || '发文号'}`
        });
    }

    getCustomAttributeDefinitions(config, docInfo).forEach(attrDef => {
        if (attributes[attrDef.id]) {
            const isCheckbox = attrDef.type === 'checkbox';
            schema.push({
                type: isCheckbox ? 'checkbox' : 'text',
                id: attrDef.id,
                name: attrDef.id,
                label: attrDef.name,
                placeholder: `请输入${attrDef.name}`,
                isCustom: true,
                ...(isCheckbox && { inline: true })
            });
        }
    });

    return schema;
}