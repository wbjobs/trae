local Player = {}
Player.__index = Player

local const = require("constants")
local util = require("util")

function Player.new(x, y)
    local self = setmetatable({}, Player)
    self.x = x
    self.y = y
    self.radius = const.PLAYER_RADIUS
    self.speed = const.PLAYER_SPEED
    self.hp = const.PLAYER_MAX_HP
    self.maxHp = const.PLAYER_MAX_HP
    self.angle = 0
    self.flashRange = const.FLASH_RANGE
    self.flashHalfAngle = const.FLASH_HALF_ANGLE
    self.invulnTimer = 0
    return self
end

function Player:update(dt, input)
    local dx = 0
    local dy = 0
    if input.up then dy = dy - 1 end
    if input.down then dy = dy + 1 end
    if input.left then dx = dx - 1 end
    if input.right then dx = dx + 1 end
    if dx ~= 0 or dy ~= 0 then
        dx, dy = util.normalize(dx, dy)
        self.x = self.x + dx * self.speed * dt
        self.y = self.y + dy * self.speed * dt
    end
    self.x = util.clamp(self.x, self.radius, const.WORLD_W - self.radius)
    self.y = util.clamp(self.y, self.radius, const.WORLD_H - self.radius)

    local wx, wy = input.mouseWorldX, input.mouseWorldY
    self.angle = math.atan2(wy - self.y, wx - self.x)

    if self.invulnTimer > 0 then
        self.invulnTimer = self.invulnTimer - dt
    end
end

function Player:takeDamage(amount)
    if self.invulnTimer > 0 then return false end
    self.hp = math.max(0, self.hp - amount)
    self.invulnTimer = 0.4
    return true
end

function Player:draw()
    if self.invulnTimer > 0 and math.floor(self.invulnTimer * 20) % 2 == 0 then
        love.graphics.setColor(1, 0.6, 0.6, 1)
    else
        love.graphics.setColor(0.3, 0.8, 1, 1)
    end
    love.graphics.circle("fill", self.x, self.y, self.radius)

    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setLineWidth(2)
    love.graphics.circle("line", self.x, self.y, self.radius)

    local gunLen = 22
    local gx = self.x + math.cos(self.angle) * gunLen
    local gy = self.y + math.sin(self.angle) * gunLen
    love.graphics.setColor(0.9, 0.9, 0.9, 1)
    love.graphics.setLineWidth(4)
    love.graphics.line(self.x, self.y, gx, gy)
end

return Player
