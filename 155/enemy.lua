local Enemy = {}
Enemy.__index = Enemy

local const = require("constants")
local util = require("util")

local STATE_HIDDEN = "hidden"
local STATE_CHASE = "chase"
local STATE_ATTACK = "attack"

function Enemy.new(x, y)
    local self = setmetatable({}, Enemy)
    self.x = x
    self.y = y
    self.radius = const.ENEMY_RADIUS
    self.speed = const.ENEMY_SPEED
    self.hp = 50
    self.maxHp = 50
    self.state = STATE_HIDDEN
    self.attackCooldown = 0
    self.angle = math.random() * math.pi * 2
    self.wanderTimer = 0
    self.wanderDirX = math.cos(self.angle)
    self.wanderDirY = math.sin(self.angle)
    return self
end

function Enemy:isLitByFlashlight(px, py, pAngle, halfAngle, range)
    local dx = self.x - px
    local dy = self.y - py
    local dist = math.sqrt(dx * dx + dy * dy)
    if dist > range + self.radius then return false end
    local ang = math.atan2(dy, dx)
    local diff = math.abs(util.angle_diff(ang, pAngle))
    return diff <= halfAngle
end

function Enemy:update(dt, player)
    if self.attackCooldown > 0 then
        self.attackCooldown = self.attackCooldown - dt
    end

    local lit = self:isLitByFlashlight(
        player.x, player.y, player.angle,
        player.flashHalfAngle, player.flashRange
    )

    local distToPlayer = util.distance(self.x, self.y, player.x, player.y)

    if lit and distToPlayer < player.flashRange * 0.9 then
        self.state = STATE_CHASE
    else
        if self.state == STATE_CHASE and distToPlayer > player.flashRange * 1.3 then
            self.state = STATE_HIDDEN
        end
    end

    if self.state == STATE_CHASE then
        local dx = player.x - self.x
        local dy = player.y - self.y
        local nx, ny = util.normalize(dx, dy)
        local spd = self.speed * 1.15
        self.x = self.x + nx * spd * dt
        self.y = self.y + ny * spd * dt

        if distToPlayer < self.radius + player.radius + 4 then
            if self.attackCooldown <= 0 then
                if player:takeDamage(const.ENEMY_DAMAGE) then
                    self.attackCooldown = const.ENEMY_ATTACK_COOLDOWN
                end
            end
        end
    else
        self.wanderTimer = self.wanderTimer - dt
        if self.wanderTimer <= 0 then
            self.angle = math.random() * math.pi * 2
            self.wanderDirX = math.cos(self.angle)
            self.wanderDirY = math.sin(self.angle)
            self.wanderTimer = util.rand_range(1.2, 3.0)
        end
        local spd = self.speed * 0.35
        self.x = self.x + self.wanderDirX * spd * dt
        self.y = self.y + self.wanderDirY * spd * dt
    end

    self.x = util.clamp(self.x, self.radius, const.WORLD_W - self.radius)
    self.y = util.clamp(self.y, self.radius, const.WORLD_H - self.radius)
end

function Enemy:draw(isVisible)
    if isVisible then
        love.graphics.setColor(0.85, 0.15, 0.2, 1)
        love.graphics.circle("fill", self.x, self.y, self.radius)
        love.graphics.setColor(1, 1, 1, 1)
        love.graphics.setLineWidth(1.5)
        love.graphics.circle("line", self.x, self.y, self.radius)

        if self.hp < self.maxHp then
            local w = self.radius * 2
            local h = 4
            local x = self.x - self.radius
            local y = self.y - self.radius - 10
            love.graphics.setColor(0.2, 0.2, 0.2, 0.8)
            love.graphics.rectangle("fill", x, y, w, h)
            love.graphics.setColor(0.2, 0.9, 0.2, 1)
            love.graphics.rectangle("fill", x, y, w * (self.hp / self.maxHp), h)
        end
    end
end

return Enemy
