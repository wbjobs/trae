class DashboardThemes:
    THEMES = {
        'dark': {
            'name': '暗黑主题',
            'background_color': '#0F172A',
            'card_background': 'rgba(255,255,255,0.05)',
            'text_color': '#E2E8F0',
            'accent_color': '#4ECDC4',
            'secondary_color': '#45B7D1',
            'chart_colors': ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'],
            'grid_color': 'rgba(255,255,255,0.1)',
            'border_color': 'rgba(255,255,255,0.1)'
        },
        'light': {
            'name': '明亮主题',
            'background_color': '#F8FAFC',
            'card_background': '#FFFFFF',
            'text_color': '#1E293B',
            'accent_color': '#3B82F6',
            'secondary_color': '#8B5CF6',
            'chart_colors': ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'],
            'grid_color': 'rgba(0,0,0,0.1)',
            'border_color': 'rgba(0,0,0,0.1)'
        },
        'blue': {
            'name': '蓝色科技',
            'background_color': '#0A192F',
            'card_background': 'rgba(30, 60, 114, 0.3)',
            'text_color': '#E6F1FF',
            'accent_color': '#00D4FF',
            'secondary_color': '#64FFDA',
            'chart_colors': ['#00D4FF', '#64FFDA', '#5C7CFA', '#FF6B6B', '#FFE66D', '#F38181', '#AA96DA'],
            'grid_color': 'rgba(0, 212, 255, 0.2)',
            'border_color': 'rgba(0, 212, 255, 0.3)'
        },
        'green': {
            'name': '绿色环保',
            'background_color': '#0D1B1E',
            'card_background': 'rgba(16, 185, 129, 0.1)',
            'text_color': '#ECFDF5',
            'accent_color': '#10B981',
            'secondary_color': '#34D399',
            'chart_colors': ['#10B981', '#34D399', '#6EE7B7', '#F59E0B', '#FCD34D', '#FB923C', '#F97316'],
            'grid_color': 'rgba(16, 185, 129, 0.2)',
            'border_color': 'rgba(16, 185, 129, 0.3)'
        },
        'purple': {
            'name': '紫色梦幻',
            'background_color': '#1A1025',
            'card_background': 'rgba(139, 92, 246, 0.1)',
            'text_color': '#F5F3FF',
            'accent_color': '#8B5CF6',
            'secondary_color': '#A78BFA',
            'chart_colors': ['#8B5CF6', '#A78BFA', '#C4B5FD', '#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8'],
            'grid_color': 'rgba(139, 92, 246, 0.2)',
            'border_color': 'rgba(139, 92, 246, 0.3)'
        },
        'orange': {
            'name': '橙色活力',
            'background_color': '#1C1306',
            'card_background': 'rgba(251, 146, 60, 0.1)',
            'text_color': '#FFF7ED',
            'accent_color': '#F97316',
            'secondary_color': '#FB923C',
            'chart_colors': ['#F97316', '#FB923C', '#FDBA74', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'],
            'grid_color': 'rgba(249, 115, 22, 0.2)',
            'border_color': 'rgba(249, 115, 22, 0.3)'
        }
    }

    @classmethod
    def get_theme(cls, theme_name='dark'):
        return cls.THEMES.get(theme_name, cls.THEMES['dark'])

    @classmethod
    def list_themes(cls):
        return [{'id': k, 'name': v['name']} for k, v in cls.THEMES.items()]

    @classmethod
    def apply_theme(cls, renderer, theme_name='dark'):
        theme = cls.get_theme(theme_name)
        renderer.colors = theme['chart_colors']
        renderer.bg_color = theme['background_color']
        renderer.text_color = theme['text_color']
        return theme


class LayoutTemplates:
    TEMPLATES = {
        'standard': {
            'name': '标准布局',
            'layout': {
                'kpi_section': {'cols': 5, 'order': 1},
                'trend_section': {'cols': 2, 'order': 2},
                'distribution_section': {'cols': 2, 'order': 3},
                'anomaly_section': {'cols': 2, 'order': 4}
            },
            'charts': {
                'kpi_section': ['total_energy', 'avg_power', 'peak_power', 'equipment_count', 'anomaly_count'],
                'trend_section': ['hourly_trend', 'daily_trend'],
                'distribution_section': ['factory_pie', 'workshop_bar', 'top_equipment'],
                'anomaly_section': ['anomaly_timeline', 'anomaly_scatter']
            }
        },
        'compact': {
            'name': '紧凑布局',
            'layout': {
                'kpi_section': {'cols': 5, 'order': 1},
                'main_section': {'cols': 3, 'order': 2}
            },
            'charts': {
                'kpi_section': ['total_energy', 'avg_power', 'peak_power', 'equipment_count', 'anomaly_count'],
                'main_section': ['daily_trend', 'factory_pie', 'top_equipment']
            }
        },
        'focus_trend': {
            'name': '趋势聚焦',
            'layout': {
                'kpi_section': {'cols': 4, 'order': 1},
                'large_trend': {'cols': 1, 'order': 2},
                'side_section': {'cols': 2, 'order': 3}
            },
            'charts': {
                'kpi_section': ['total_energy', 'avg_power', 'peak_power', 'anomaly_count'],
                'large_trend': ['daily_trend'],
                'side_section': ['factory_pie', 'top_equipment', 'hourly_trend']
            }
        },
        'anomaly_focus': {
            'name': '异常聚焦',
            'layout': {
                'kpi_section': {'cols': 4, 'order': 1},
                'anomaly_main': {'cols': 1, 'order': 2},
                'context_section': {'cols': 2, 'order': 3}
            },
            'charts': {
                'kpi_section': ['anomaly_count', 'avg_power', 'peak_power', 'equipment_count'],
                'anomaly_main': ['anomaly_timeline', 'anomaly_scatter'],
                'context_section': ['daily_trend', 'factory_pie']
            }
        },
        'full_screen': {
            'name': '全屏大屏',
            'layout': {
                'top_kpi': {'cols': 6, 'order': 1},
                'center_charts': {'cols': 3, 'order': 2},
                'bottom_charts': {'cols': 2, 'order': 3}
            },
            'charts': {
                'top_kpi': ['total_energy', 'avg_power', 'peak_power', 'equipment_count', 'anomaly_count', 'total_saving'],
                'center_charts': ['daily_trend', 'factory_pie', 'workshop_bar'],
                'bottom_charts': ['hourly_trend', 'top_equipment', 'anomaly_scatter']
            }
        }
    }

    @classmethod
    def get_template(cls, template_name='standard'):
        return cls.TEMPLATES.get(template_name, cls.TEMPLATES['standard'])

    @classmethod
    def list_templates(cls):
        return [{'id': k, 'name': v['name']} for k, v in cls.TEMPLATES.items()]

    @classmethod
    def get_layout_css(cls, template_name='standard'):
        template = cls.get_template(template_name)
        css = []
        
        for section, config in template['layout'].items():
            if config['cols'] == 1:
                css.append(f".{section} {{ grid-column: 1 / -1; }}")
            else:
                css.append(f".{section} {{ display: grid; grid-template-columns: repeat({config['cols']}, 1fr); gap: 20px; }}")
        
        return '\n'.join(css)
