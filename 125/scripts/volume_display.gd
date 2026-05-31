extends Control

@export var volume_tracker: VolumeTracker
@export var update_interval: float = 0.5

var timer: float = 0.0

@onready var volume_label: Label = $VolumeLabel
@onready var summary_label: Label = $SummaryLabel

func _ready() -> void:
    pass

func _process(delta: float) -> void:
    timer += delta
    if timer >= update_interval:
        timer = 0.0
        _update_display()

func _update_display() -> void:
    if not volume_tracker:
        return

    var net_change: double = volume_tracker.get_net_volume_change()
    var total_added: double = volume_tracker.get_total_volume_added()
    var total_removed: double = volume_tracker.get_total_volume_removed()
    var explosion_count: int = volume_tracker.get_explosion_count()

    if volume_label:
        var sign: String = "+" if net_change >= 0 else ""
        volume_label.text = "体积变化: %s%.2f m³" % [sign, net_change]
        volume_label.modulate = Color.GREEN if net_change >= 0 else Color.RED

    if summary_label:
        summary_label.text = "爆炸次数: %d | 增加: %.2f m³ | 移除: %.2f m³" % [
            explosion_count,
            total_added,
            total_removed
        ]

func set_volume_tracker(tracker: VolumeTracker) -> void:
    volume_tracker = tracker
    _update_display()
