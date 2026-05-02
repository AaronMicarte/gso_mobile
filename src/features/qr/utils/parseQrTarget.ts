export type ParsedQrTarget =
    | { kind: 'property'; propertyId: number }
    | { kind: 'inventory'; inventoryId: number; inventoryDetailId: number | null }
    | null;

export function parseQrTarget(raw: string): ParsedQrTarget {
    const value = raw.trim();
    if (value === '') return null;

    const direct = Number(value);
    if (Number.isInteger(direct) && direct > 0) {
        return { kind: 'property', propertyId: direct };
    }

    const parsePath = (pathname: string, search = ''): ParsedQrTarget => {
        const params = new URLSearchParams(search);
        const detailParam = params.get('detail');
        const parsedDetailId = detailParam ? Number(detailParam) : NaN;
        const inventoryDetailId = Number.isInteger(parsedDetailId) && parsedDetailId > 0 ? parsedDetailId : null;

        const qrMatch = pathname.match(/\/qr\/scan\/(\d+)/);
        if (qrMatch?.[1]) {
            const propertyId = Number(qrMatch[1]);
            if (Number.isInteger(propertyId) && propertyId > 0) return { kind: 'property', propertyId };
        }

        const inventoryMatch = pathname.match(/\/(?:(admin|staff|department_head)\/)?inventory\/(\d+)/);
        if (inventoryMatch?.[2]) {
            const inventoryId = Number(inventoryMatch[2]);
            if (Number.isInteger(inventoryId) && inventoryId > 0) {
                return { kind: 'inventory', inventoryId, inventoryDetailId };
            }
        }

        return null;
    };

    try {
        const asUrl = new URL(value);
        return parsePath(asUrl.pathname, asUrl.search);
    } catch {
        // not a URL
    }

    const routeLike = value.match(/^(\/[^^\s?#]+)(\?[^\s#]+)?(#[^\s]+)?$/);
    if (routeLike?.[1]) {
        return parsePath(routeLike[1], routeLike[2] ?? '');
    }

    return null;
}