using System;
using UnityEngine;

public class UnitView : MonoBehaviour
{
    public UnitData UnitData { get; private set; }

    [SerializeField] private Renderer _renderer;
    [SerializeField] private Color playerColor = new Color(0.3f, 0.6f, 1f);
    [SerializeField] private Color enemyColor = new Color(1f, 0.3f, 0.3f);
    [SerializeField] private Color highlightColor = new Color(1f, 1f, 0.5f, 0.8f);

    [SerializeField] private TextMesh _nameText;
    [SerializeField] private TextMesh _hpText;

    private Color _originalColor;
    private HighlightType _currentHighlight = HighlightType.None;

    public event Action<UnitData> OnUnitClicked;

    public void Initialize(UnitData data)
    {
        UnitData = data;
        UpdateData(data);
    }

    public void UpdateData(UnitData data)
    {
        UnitData = data;

        if (_renderer != null)
        {
            _originalColor = data.team == "player" ? playerColor : enemyColor;
            _renderer.material.color = _originalColor;
        }

        if (_nameText != null)
        {
            _nameText.text = data.name;
        }

        if (_hpText != null)
        {
            _hpText.text = $"{data.hp:F0}/{data.max_hp:F0}";
        }

        if (!data.is_alive)
        {
            gameObject.SetActive(false);
        }
    }

    public void SetHighlight(HighlightType type)
    {
        _currentHighlight = type;
        UpdateHighlight();
    }

    public void ClearHighlight()
    {
        _currentHighlight = HighlightType.None;
        UpdateHighlight();
    }

    private void UpdateHighlight()
    {
        if (_renderer == null) return;

        if (_currentHighlight == HighlightType.None)
        {
            _renderer.material.color = _originalColor;
        }
        else if (_currentHighlight == HighlightType.Attack)
        {
            _renderer.material.color = Color.Lerp(_originalColor, Color.red, 0.5f);
        }
        else
        {
            _renderer.material.color = Color.Lerp(_originalColor, highlightColor, 0.5f);
        }
    }

    private void OnMouseDown()
    {
        if (UnitData != null && UnitData.is_alive)
        {
            OnUnitClicked?.Invoke(UnitData);
        }
    }
}
