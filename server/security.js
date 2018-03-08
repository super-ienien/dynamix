const _ = require('lodash');
const privates = require ('privates');

/**
 *
 * Property
 *
 * {
 *  group: {domain: true}
 *  roles: {role: true}
 * }
 *
 */

module.exports = {
    isAllowed (dynamix, user, operation, property)
    {
        if (property.security[operation])
        {
            let rules = property.security[operation];
            rules:
            for (let i = 0, l = rules.length; i < l; i++)
            {
                let rule = rules[i];
                if (rule.domain)
                {
                    let domainMatch = false;
                    for (let i in dynamix[privates.group])
                    {
                        if (user.group.has(i))
                        {
                            domainMatch = true;
                            break;
                        }
                    }
                    if (!domainMatch) continue rules;
                }
                if (rule.role)
                {
                    if (!user.roles.has(rule.role)) continue rules;
                }
                else if (rule.roles)
                {
                    for (let i in rule.roles)
                    {
                        if (!user.roles.has(i)) continue rules;
                    }
                }
                return true;
            }
        }
        return false;
    }
,   makePropertyRules (val, domain = false)
    {
        let rules = {};
        if (!val)
        {
            return rules;
        }
        switch (typeof val)
        {
            case 'string':
                switch (val)
                {
                    case 'r':
                        rules.r = [{domain}];
                    break;
                    case 'w':
                        rules.w = [{domain}];
                        break;
                    case 'x':
                        rules.x = [{domain}];
                        break;
                    default:
                        throw new Error ('Invalid access value '+val);
                }
            break;
            case 'object':
            {
                for (let i in val)
                {
                    let operation = val[i];
                    switch (operation)
                    {
                        case 'r':
                        case 'w':
                        case 'x':
                            let rule = {domain};
                            if (!rules[operation]) rules[operation] = [rule];
                            else rules[operation].push(rule);
                            let roles = i.split('&').map((role) => role.trim()).filter((role) =>
                            {
                                if (rule.domain && (role === '$' || role.startsWith('$'))) rule.domain = false;
                                return !!role;
                            });

                            if (roles.length === 1) rule.role = roles[i];
                            else if (roles.length > 1) rule.roles = roles;
                        break;
                        default:
                            throw new Error ('Invalid access value ' + i + ' > ' + operation);
                    }
                }
            }
        }
        return rules;
    }
};