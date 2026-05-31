function love.conf(t)
    t.identity = "TopDownShooter"
    t.version = "11.4"
    t.console = true

    t.window.title = "Top-Down Flashlight Shooter"
    t.window.width = 960
    t.window.height = 720
    t.window.minwidth = 640
    t.window.minheight = 480
    t.window.resizable = true
    t.window.msaa = 4

    t.modules.audio = true
    t.modules.graphics = true
    t.modules.image = true
    t.modules.keyboard = true
    t.modules.mouse = true
    t.modules.timer = true
    t.modules.window = true
    t.modules.math = true
    t.modules.physics = false
    t.modules.event = true
    t.modules.system = true
end
