local util = {}

function util.clamp(v, a, b)
    if v < a then return a end
    if v > b then return b end
    return v
end

function util.lerp(a, b, t)
    return a + (b - a) * t
end

function util.length(x, y)
    return math.sqrt(x * x + y * y)
end

function util.normalize(x, y)
    local l = math.sqrt(x * x + y * y)
    if l < 1e-8 then return 0, 0, 0 end
    return x / l, y / l, l
end

function util.distance(ax, ay, bx, by)
    local dx = ax - bx
    local dy = ay - by
    return math.sqrt(dx * dx + dy * dy)
end

function util.angle_diff(a, b)
    local d = (a - b) % (2 * math.pi)
    if d > math.pi then d = d - 2 * math.pi end
    return d
end

function util.rand_range(a, b)
    return a + math.random() * (b - a)
end

return util
