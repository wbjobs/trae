local Weapon = {}
Weapon.__index = Weapon

local const = require("constants")

Weapon.TYPE_PISTOL = "pistol"
Weapon.TYPE_SHOTGUN = "shotgun"

function Weapon.new(weaponType)
    local self = setmetatable({}, Weapon)
    self.type = weaponType
    if weaponType == Weapon.TYPE_PISTOL then
        self.damage = const.PISTOL_DAMAGE
        self.fireInterval = const.PISTOL_FIRE_INTERVAL
        self.magSize = const.PISTOL_MAG_SIZE
        self.reloadTime = const.PISTOL_RELOAD_TIME
        self.spread = const.PISTOL_SPREAD
        self.pellets = 1
        self.ammoMax = const.PISTOL_AMMO_MAX
        self.name = "Pistol"
    else
        self.damage = const.SHOTGUN_DAMAGE
        self.fireInterval = const.SHOTGUN_FIRE_INTERVAL
        self.magSize = const.SHOTGUN_MAG_SIZE
        self.reloadTime = const.SHOTGUN_RELOAD_TIME
        self.spread = const.SHOTGUN_SPREAD
        self.pellets = const.SHOTGUN_PELLETS
        self.ammoMax = const.SHOTGUN_AMMO_MAX
        self.name = "Shotgun"
    end
    self.ammoInMag = self.magSize
    self.ammoReserve = self.ammoMax - self.magSize
    self.fireTimer = 0
    self.reloadTimer = 0
    self.isReloading = false
    return self
end

function Weapon:update(dt)
    if self.fireTimer > 0 then
        self.fireTimer = self.fireTimer - dt
    end
    if self.isReloading then
        self.reloadTimer = self.reloadTimer - dt
        if self.reloadTimer <= 0 then
            local needed = self.magSize - self.ammoInMag
            local take = math.min(needed, self.ammoReserve)
            self.ammoInMag = self.ammoInMag + take
            self.ammoReserve = self.ammoReserve - take
            self.isReloading = false
        end
    end
end

function Weapon:canShoot()
    return not self.isReloading
        and self.fireTimer <= 0
        and self.ammoInMag > 0
end

function Weapon:reload()
    if self.isReloading then return false end
    if self.ammoInMag >= self.magSize then return false end
    if self.ammoReserve <= 0 then return false end
    self.isReloading = true
    self.reloadTimer = self.reloadTime
    return true
end

function Weapon:shoot(shootX, shootY, angle)
    if not self:canShoot() then return {} end
    self.ammoInMag = self.ammoInMag - 1
    self.fireTimer = self.fireInterval

    local bullets = {}
    for i = 1, self.pellets do
        local a = angle + (math.random() - 0.5) * 2 * self.spread
        table.insert(bullets, {
            x = shootX,
            y = shootY,
            vx = math.cos(a) * const.BULLET_SPEED,
            vy = math.sin(a) * const.BULLET_SPEED,
            damage = self.damage,
            life = const.BULLET_MAX_LIFE,
            radius = const.BULLET_RADIUS,
        })
    end
    return bullets
end

return Weapon
