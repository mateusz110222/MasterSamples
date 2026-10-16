export const formatMessage = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
