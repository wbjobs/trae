local const = require("constants")
local util = require("util")
local Player = require("player")
local Enemy = require("enemy")
local Weapon = require("weapon")

local state = {
    player = nil,
    enemies = {},
    bullets = {},
    particles = {},
    weapons = {},
    currentWeaponIndex = 1,
    kills = 0,
    totalEnemiesSpawned = 0,
    spawnTimer = 0,
    gameOver = false,
    paused = false,
    camera = { x = 0, y = 0 },
    mouseWorld = { x = 0, y = 0 },
    lightCanvas = nil,
    lightShader = nil,
    mainCanvas = nil,
    screenShake = 0,
    time = 0,
    muzzleFlash = { x = 0, y = 0, strength = 0, radius = 140 },
}

local function createLightShader()
    local code = [[
        extern number playerX;
        extern number playerY;
        extern number playerAngle;
        extern number flashRange;
        extern number flashHalfAngle;
        extern number ambient;
        extern number cameraX;
        extern number cameraY;
        extern number muzzleX;
        extern number muzzleY;
        extern number muzzleStrength;
        extern number muzzleRadius;
        extern number screenW;
        extern number screenH;

        float bayer8(vec2 pos) {
            int x = int(mod(pos.x, 8.0));
            int y = int(mod(pos.y, 8.0));
            int index = x + y * 8;
            float m[64];
            m[0]=0.;   m[1]=32.;  m[2]=8.;   m[3]=40.;  m[4]=2.;   m[5]=34.;  m[6]=10.;  m[7]=42.;
            m[8]=48.;  m[9]=16.;  m[10]=56.; m[11]=24.; m[12]=50.; m[13]=18.; m[14]=58.; m[15]=26.;
            m[16]=12.; m[17]=44.; m[18]=4.;  m[19]=36.; m[20]=14.; m[21]=46.; m[22]=6.;  m[23]=38.;
            m[24]=60.; m[25]=28.; m[26]=52.; m[27]=20.; m[28]=62.; m[29]=30.; m[30]=54.; m[31]=22.;
            m[32]=3.;  m[33]=35.; m[34]=11.; m[35]=43.; m[36]=1.;  m[37]=33.; m[38]=9.;  m[39]=41.;
            m[40]=51.; m[41]=19.; m[42]=59.; m[43]=27.; m[44]=49.; m[45]=17.; m[46]=57.; m[47]=25.;
            m[48]=15.; m[49]=47.; m[50]=7.;  m[51]=39.; m[52]=13.; m[53]=45.; m[54]=5.;  m[55]=37.;
            m[56]=63.; m[57]=31.; m[58]=55.; m[59]=23.; m[60]=61.; m[61]=29.; m[62]=53.; m[63]=21.;
            return (m[index] / 64.0) - 0.5;
        }

        vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords)
        {
            vec4 pixel = Texel(tex, texture_coords);

            float wx = screen_coords.x + cameraX;
            float wy = screen_coords.y + cameraY;

            float dx = wx - playerX;
            float dy = wy - playerY;
            float dist = sqrt(dx * dx + dy * dy);
            float ang = atan2(dy, dx);
            float diff = ang - playerAngle;
            while (diff > 3.14159265) diff -= 6.2831853;
            while (diff < -3.14159265) diff += 6.2831853;
            float absDiff = abs(diff);

            float light = ambient;

            if (absDiff <= flashHalfAngle && dist <= flashRange) {
                float angleFade = 1.0 - smoothstep(flashHalfAngle * 0.6, flashHalfAngle, absDiff);
                float distFade = 1.0 - smoothstep(flashRange * 0.5, flashRange, dist);
                float cone = angleFade * distFade;
                light = ambient + cone * (1.0 - ambient);
            }

            if (dist < 80.0) {
                float glow = (1.0 - smoothstep(0.0, 80.0, dist)) * 0.25;
                light = min(1.0, light + glow);
            }

            if (muzzleStrength > 0.001) {
                float mdx = wx - muzzleX;
                float mdy = wy - muzzleY;
                float mdist = sqrt(mdx * mdx + mdy * mdy);
                if (mdist < muzzleRadius) {
                    float mfalloff = 1.0 - smoothstep(0.0, muzzleRadius, mdist);
                    float mlight = mfalloff * mstrength;
                    light = min(1.0, light + mlight);
                }
            }

            float dither = bayer8(screen_coords) / 255.0;
            vec3 result = pixel.rgb * light + dither;
            result = clamp(result, 0.0, 1.0);

            return vec4(result, pixel.a);
        }
    ]]
    local ok, shader = pcall(love.graphics.newShader, code)
    if ok then return shader end
    return nil
end

function love.load()
    math.randomseed(os.time())
    love.mouse.setVisible(true)

    state.player = Player.new(const.WORLD_W / 2, const.WORLD_H / 2)

    state.weapons = {
        Weapon.new(Weapon.TYPE_PISTOL),
        Weapon.new(Weapon.TYPE_SHOTGUN),
    }

    for i = 1, const.ENEMY_INITIAL_COUNT do
        spawnEnemy()
    end

    local w, h = love.graphics.getDimensions()
    state.mainCanvas = love.graphics.newCanvas(w, h, { format = "rgba16f" })
    state.lightCanvas = love.graphics.newCanvas(w, h, { format = "rgba16f" })
    state.lightShader = createLightShader()

    love.graphics.setBackgroundColor(0.02, 0.02, 0.04, 1)
end

function spawnEnemy()
    local px, py = state.player.x, state.player.y
    local x, y
    local attempts = 0
    repeat
        local a = math.random() * math.pi * 2
        local d = util.rand_range(const.ENEMY_SPAWN_DIST_MIN, const.ENEMY_SPAWN_DIST_MAX)
        x = px + math.cos(a) * d
        y = py + math.sin(a) * d
        attempts = attempts + 1
    until (x > 40 and x < const.WORLD_W - 40 and y > 40 and y < const.WORLD_H - 40) or attempts > 20
    x = util.clamp(x, 40, const.WORLD_W - 40)
    y = util.clamp(y, 40, const.WORLD_H - 40)
    table.insert(state.enemies, Enemy.new(x, y))
    state.totalEnemiesSpawned = state.totalEnemiesSpawned + 1
end

function love.resize(w, h)
    state.mainCanvas = love.graphics.newCanvas(w, h, { format = "rgba16f" })
    state.lightCanvas = love.graphics.newCanvas(w, h, { format = "rgba16f" })
end

function love.keypressed(key)
    if key == "1" then
        state.currentWeaponIndex = 1
    elseif key == "2" then
        state.currentWeaponIndex = 2
    elseif key == "r" or key == "R" then
        local w = state.weapons[state.currentWeaponIndex]
        if w then w:reload() end
    elseif key == "q" or key == "Q" then
        state.currentWeaponIndex = state.currentWeaponIndex == 1 and 2 or 1
    elseif key == "escape" then
        state.paused = not state.paused
    elseif key == "return" and state.gameOver then
        love.event.quit("restart")
    end
end

function love.mousepressed(x, y, button)
    if button == 1 and not state.gameOver and not state.paused then
        tryShoot()
    end
end

function tryShoot()
    local p = state.player
    local w = state.weapons[state.currentWeaponIndex]
    if not w then return end
    local muzzleDist = p.radius + 18
    local sx = p.x + math.cos(p.angle) * muzzleDist
    local sy = p.y + math.sin(p.angle) * muzzleDist
    local bullets = w:shoot(sx, sy, p.angle)
    for _, b in ipairs(bullets) do
        table.insert(state.bullets, b)
    end
    if #bullets > 0 then
        state.screenShake = math.max(state.screenShake, w.type == Weapon.TYPE_SHOTGUN and 8 or 3)
        state.muzzleFlash.x = sx
        state.muzzleFlash.y = sy
        state.muzzleFlash.strength = w.type == Weapon.TYPE_SHOTGUN and 0.75 or 0.45
        for i = 1, (w.type == Weapon.TYPE_SHOTGUN and 8 or 4) do
            table.insert(state.particles, {
                x = sx, y = sy,
                vx = math.cos(p.angle) * util.rand_range(80, 200) + util.rand_range(-60, 60),
                vy = math.sin(p.angle) * util.rand_range(80, 200) + util.rand_range(-60, 60),
                life = 0.25, maxLife = 0.25,
                color = {1, 0.8, 0.3},
                size = 3,
            })
        end
    end
end

function love.update(dt)
    if state.paused or state.gameOver then return end

    state.time = state.time + dt

    local input = getInput()
    state.player:update(dt, input)

    for _, w in ipairs(state.weapons) do
        w:update(dt)
    end

    if love.mouse.isDown(1) then
        tryShoot()
    end

    updateBullets(dt)
    updateEnemies(dt)
    updateParticles(dt)
    updateCamera()
    updateSpawning(dt)

    state.screenShake = math.max(0, state.screenShake - dt * 30)

    if state.muzzleFlash.strength > 0 then
        state.muzzleFlash.strength = math.max(0, state.muzzleFlash.strength - dt * 6)
    end

    if state.player.hp <= 0 then
        state.gameOver = true
    end
end

function getInput()
    local mx, my = love.mouse.getPosition()
    local w, h = love.graphics.getDimensions()
    local cam = state.camera
    local wx = mx + cam.x
    local wy = my + cam.y
    return {
        up = love.keyboard.isDown("w") or love.keyboard.isDown("up"),
        down = love.keyboard.isDown("s") or love.keyboard.isDown("down"),
        left = love.keyboard.isDown("a") or love.keyboard.isDown("left"),
        right = love.keyboard.isDown("d") or love.keyboard.isDown("right"),
        mouseWorldX = wx,
        mouseWorldY = wy,
    }
end

function updateBullets(dt)
    for i = #state.bullets, 1, -1 do
        local b = state.bullets[i]
        b.x = b.x + b.vx * dt
        b.y = b.y + b.vy * dt
        b.life = b.life - dt

        local hit = false
        for j = #state.enemies, 1, -1 do
            local e = state.enemies[j]
            local d = util.distance(b.x, b.y, e.x, e.y)
            if d < b.radius + e.radius then
                e.hp = e.hp - b.damage
                spawnHitParticles(b.x, b.y)
                hit = true
                if e.hp <= 0 then
                    table.remove(state.enemies, j)
                    state.kills = state.kills + 1
                    spawnDeathParticles(e.x, e.y)
                end
                break
            end
        end

        if hit or b.life <= 0
            or b.x < 0 or b.x > const.WORLD_W
            or b.y < 0 or b.y > const.WORLD_H then
            table.remove(state.bullets, i)
        end
    end
end

function updateEnemies(dt)
    for _, e in ipairs(state.enemies) do
        e:update(dt, state.player)
    end
end

function updateParticles(dt)
    for i = #state.particles, 1, -1 do
        local p = state.particles[i]
        p.x = p.x + p.vx * dt
        p.y = p.y + p.vy * dt
        p.vx = p.vx * 0.92
        p.vy = p.vy * 0.92
        p.life = p.life - dt
        if p.life <= 0 then
            table.remove(state.particles, i)
        end
    end
end

function spawnHitParticles(x, y)
    for i = 1, 6 do
        table.insert(state.particles, {
            x = x, y = y,
            vx = util.rand_range(-180, 180),
            vy = util.rand_range(-180, 180),
            life = 0.3, maxLife = 0.3,
            color = {1, 0.2, 0.2},
            size = 2.5,
        })
    end
end

function spawnDeathParticles(x, y)
    for i = 1, 18 do
        table.insert(state.particles, {
            x = x, y = y,
            vx = util.rand_range(-260, 260),
            vy = util.rand_range(-260, 260),
            life = util.rand_range(0.4, 0.9),
            maxLife = 0.9,
            color = {0.8, 0.1, 0.1},
            size = 3,
        })
    end
end

function updateCamera()
    local w, h = love.graphics.getDimensions()
    state.camera.x = state.player.x - w / 2
    state.camera.y = state.player.y - h / 2
    state.camera.x = util.clamp(state.camera.x, 0, const.WORLD_W - w)
    state.camera.y = util.clamp(state.camera.y, 0, const.WORLD_H - h)
end

function updateSpawning(dt)
    state.spawnTimer = state.spawnTimer - dt
    if state.spawnTimer <= 0 and #state.enemies < const.ENEMY_MAX_COUNT then
        spawnEnemy()
        state.spawnTimer = const.ENEMY_SPAWN_INTERVAL
    end
end

function love.draw()
    local w, h = love.graphics.getDimensions()
    local shakeX = 0
    local shakeY = 0
    if state.screenShake > 0 then
        shakeX = (math.random() - 0.5) * state.screenShake
        shakeY = (math.random() - 0.5) * state.screenShake
    end

    love.graphics.setCanvas(state.mainCanvas)
    love.graphics.clear()
    love.graphics.push()
    love.graphics.translate(-state.camera.x + shakeX, -state.camera.y + shakeY)

    drawWorld()
    drawEntities()

    love.graphics.pop()
    love.graphics.setCanvas()

    if state.lightShader then
        love.graphics.setShader(state.lightShader)
        state.lightShader:send("playerX", state.player.x)
        state.lightShader:send("playerY", state.player.y)
        state.lightShader:send("playerAngle", state.player.angle)
        state.lightShader:send("flashRange", state.player.flashRange)
        state.lightShader:send("flashHalfAngle", state.player.flashHalfAngle)
        state.lightShader:send("ambient", const.AMBIENT)
        state.lightShader:send("screenW", w)
        state.lightShader:send("screenH", h)
        state.lightShader:send("cameraX", state.camera.x - shakeX)
        state.lightShader:send("cameraY", state.camera.y - shakeY)
        state.lightShader:send("muzzleX", state.muzzleFlash.x)
        state.lightShader:send("muzzleY", state.muzzleFlash.y)
        state.lightShader:send("muzzleStrength", state.muzzleFlash.strength)
        state.lightShader:send("muzzleRadius", state.muzzleFlash.radius)
    end

    love.graphics.draw(state.mainCanvas, 0, 0)
    love.graphics.setShader()

    drawFlashlightOverlay(w, h)
    drawHUD(w, h)

    if state.gameOver then
        drawGameOver(w, h)
    elseif state.paused then
        drawPaused(w, h)
    end
end

function drawWorld()
    love.graphics.setColor(0.08, 0.08, 0.1, 1)
    love.graphics.rectangle("fill", 0, 0, const.WORLD_W, const.WORLD_H)

    love.graphics.setLineWidth(2)
    love.graphics.setColor(0.15, 0.15, 0.18, 1)
    local step = 80
    for x = 0, const.WORLD_W, step do
        love.graphics.line(x, 0, x, const.WORLD_H)
    end
    for y = 0, const.WORLD_H, step do
        love.graphics.line(0, y, const.WORLD_W, y)
    end

    love.graphics.setColor(0.35, 0.15, 0.1, 1)
    love.graphics.setLineWidth(6)
    love.graphics.rectangle("line", 0, 0, const.WORLD_W, const.WORLD_H)
end

function drawEntities()
    for _, e in ipairs(state.enemies) do
        local visible = e:isLitByFlashlight(
            state.player.x, state.player.y, state.player.angle,
            state.player.flashHalfAngle, state.player.flashRange
        )
        e:draw(visible)
    end

    for _, b in ipairs(state.bullets) do
        love.graphics.setColor(1, 0.9, 0.3, 1)
        love.graphics.circle("fill", b.x, b.y, b.radius)
    end

    for _, p in ipairs(state.particles) do
        local t = p.life / p.maxLife
        love.graphics.setColor(p.color[1], p.color[2], p.color[3], t)
        love.graphics.circle("fill", p.x, p.y, p.size * t)
    end

    state.player:draw()
end

function drawFlashlightOverlay(w, h)
    local p = state.player
    local sx = p.x - state.camera.x
    local sy = p.y - state.camera.y

    love.graphics.setBlendMode("add")
    local segs = 48
    local vertices = {sx, sy}
    for i = 0, segs do
        local a = p.angle - p.flashHalfAngle + (p.flashHalfAngle * 2 * i / segs)
        local x = sx + math.cos(a) * p.flashRange
        local y = sy + math.sin(a) * p.flashRange
        table.insert(vertices, x)
        table.insert(vertices, y)
    end
    if #vertices >= 6 then
        love.graphics.setColor(1, 0.95, 0.75, 0.08)
        love.graphics.polygon("fill", vertices)
    end
    love.graphics.setBlendMode("alpha")
end

function drawHUD(w, h)
    local p = state.player
    local weapon = state.weapons[state.currentWeaponIndex]

    love.graphics.setColor(0, 0, 0, 0.55)
    love.graphics.rectangle("fill", 10, 10, 280, 120)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle("line", 10, 10, 280, 120)

    love.graphics.setFont(love.graphics.newFont(14))
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.print(string.format("Kills: %d", state.kills), 22, 20)
    love.graphics.print(string.format("Enemies remaining: %d", #state.enemies), 22, 40)

    love.graphics.setColor(0.2, 0.2, 0.2, 1)
    love.graphics.rectangle("fill", 22, 66, 200, 14)
    love.graphics.setColor(0.9, 0.2, 0.2, 1)
    love.graphics.rectangle("fill", 22, 66, 200 * (p.hp / p.maxHp), 14)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.rectangle("line", 22, 66, 200, 14)
    love.graphics.print(string.format("HP: %d / %d", math.floor(p.hp), p.maxHp), 22, 84)

    if weapon then
        local ammoText
        if weapon.isReloading then
            ammoText = string.format("%s: reloading...", weapon.name)
        else
            ammoText = string.format("%s: %d / %d  (reserve: %d)",
                weapon.name, weapon.ammoInMag, weapon.magSize, weapon.ammoReserve)
        end
        love.graphics.setColor(0.9, 0.9, 0.3, 1)
        love.graphics.print(ammoText, 22, 104)
    end

    love.graphics.setColor(1, 1, 1, 0.6)
    local helpY = h - 92
    love.graphics.print("WASD / Arrows: move   Mouse: aim   LMB: shoot", 20, helpY)
    love.graphics.print("1/2 or Q: switch weapon   R: reload   ESC: pause", 20, helpY + 20)

    love.graphics.setColor(0, 0, 0, 0.55)
    love.graphics.rectangle("fill", w - 180, 10, 170, 56)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.rectangle("line", w - 180, 10, 170, 56)
    for i, wp in ipairs(state.weapons) do
        if i == state.currentWeaponIndex then
            love.graphics.setColor(1, 0.9, 0.3, 1)
        else
            love.graphics.setColor(0.7, 0.7, 0.7, 1)
        end
        love.graphics.print(string.format("[%d] %s", i, wp.name), w - 170, 16 + (i - 1) * 22)
    end

    local mx, my = love.mouse.getPosition()
    love.graphics.setColor(1, 1, 1, 0.8)
    love.graphics.setLineWidth(1.5)
    love.graphics.line(mx - 10, my, mx - 3, my)
    love.graphics.line(mx + 3, my, mx + 10, my)
    love.graphics.line(mx, my - 10, mx, my - 3)
    love.graphics.line(mx, my + 3, mx, my + 10)
end

function drawGameOver(w, h)
    love.graphics.setColor(0, 0, 0, 0.7)
    love.graphics.rectangle("fill", 0, 0, w, h)
    love.graphics.setColor(1, 0.3, 0.3, 1)
    love.graphics.setFont(love.graphics.newFont(48))
    love.graphics.printf("YOU DIED", 0, h / 2 - 60, w, "center")
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setFont(love.graphics.newFont(20))
    love.graphics.printf(string.format("Total kills: %d", state.kills), 0, h / 2 + 10, w, "center")
    love.graphics.printf("Press ENTER to restart   ESC to quit", 0, h / 2 + 50, w, "center")
end

function drawPaused(w, h)
    love.graphics.setColor(0, 0, 0, 0.6)
    love.graphics.rectangle("fill", 0, 0, w, h)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setFont(love.graphics.newFont(36))
    love.graphics.printf("PAUSED", 0, h / 2 - 20, w, "center")
end
