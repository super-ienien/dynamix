"use strict";

module.exports = function stringNormalizer (value) {
    switch (typeof value)
    {
        case 'string':
            return value;
        default:
            if (!value) return '';
            return String(value);
    }
};