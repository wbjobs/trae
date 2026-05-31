using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class BattleHUDUI : MonoBehaviour
{
    [SerializeField] private Text _turnText;
    [SerializeField] private Text _currentTeamText;
    [SerializeField] private Text _currentUnitText;
    [SerializeField] private Text _winnerText;
    [SerializeField] private Text _messageText;

    [SerializeField] private Button _moveButton;
    [SerializeField] private Button _attackButton;
    [SerializeField] private Button _defendButton;
    [SerializeField] private Button _endTurnButton;
    [SerializeField] private Transform _skillsContainer;
    [SerializeField] private GameObject _skillButtonPrefab;

    [SerializeField] private GameObject _gameOverPanel;

    private BattleState _currentState;
    private UnitData _selectedUnit;
    private List<GameObject> _skillButtons = new List<GameObject>();

    private void Start()
    {
        GameClient.Instance.OnBattleStateUpdated += OnBattleStateUpdated;
        GameClient.Instance.OnErrorMessage += OnErrorMessage;

        if (_moveButton != null)
            _moveButton.onClick.AddListener(OnMoveClicked);

        if (_attackButton != null)
            _attackButton.onClick.AddListener(OnAttackClicked);

        if (_defendButton != null)
            _defendButton.onClick.AddListener(OnDefendClicked);

        if (_endTurnButton != null)
            _endTurnButton.onClick.AddListener(OnEndTurnClicked);
    }

    private void OnBattleStateUpdated(BattleState state)
    {
        _currentState = state;
        UpdateHUD(state);
    }

    private void UpdateHUD(BattleState state)
    {
        if (_turnText != null)
            _turnText.text = $"回合: {state.turn}";

        if (_currentTeamText != null)
            _currentTeamText.text = $"当前队伍: {state.current_team}";

        if (state.current_unit != null)
        {
            if (_currentUnitText != null)
                _currentUnitText.text = $"当前单位: {state.current_unit.name}";

            _selectedUnit = state.current_unit;
            UpdateSkillButtons(state.current_unit);
        }

        if (state.state == "finished" && _gameOverPanel != null)
        {
            _gameOverPanel.SetActive(true);
            if (_winnerText != null)
                _winnerText.text = $"胜利者: {state.winner}";
        }

        UpdateButtonStates();
    }

    private void UpdateSkillButtons(UnitData unit)
    {
        foreach (var button in _skillButtons)
        {
            Destroy(button);
        }
        _skillButtons.Clear();

        if (unit.skills == null || _skillsContainer == null || _skillButtonPrefab == null)
            return;

        foreach (var skillId in unit.skills)
        {
            var skillObj = Instantiate(_skillButtonPrefab, _skillsContainer);
            var button = skillObj.GetComponent<Button>();
            var text = skillObj.GetComponentInChildren<Text>();

            if (text != null)
                text.text = skillId;

            bool isOnCooldown = unit.skill_cooldowns != null && 
                                unit.skill_cooldowns.ContainsKey(skillId) && 
                                unit.skill_cooldowns[skillId] > 0;

            if (button != null)
            {
                string capturedSkillId = skillId;
                button.onClick.AddListener(() => OnSkillClicked(capturedSkillId));
                button.interactable = !isOnCooldown && !unit.has_acted;
            }

            _skillButtons.Add(skillObj);
        }
    }

    private void UpdateButtonStates()
    {
        if (_currentState == null || _currentState.current_unit == null)
            return;

        var unit = _currentState.current_unit;
        bool isPlayerTurn = unit.team == "player" && 
                           GameManager.Instance.CurrentMode == GameMode.PlayerVsAI;

        if (_moveButton != null)
            _moveButton.interactable = isPlayerTurn && !unit.has_moved;

        if (_attackButton != null)
            _attackButton.interactable = isPlayerTurn && !unit.has_acted;

        if (_defendButton != null)
            _defendButton.interactable = isPlayerTurn && !unit.has_acted;

        if (_endTurnButton != null)
            _endTurnButton.interactable = isPlayerTurn;
    }

    private void OnMoveClicked()
    {
        var battleGrid = FindObjectOfType<BattleGridUI>();
        battleGrid?.OnMoveButtonClicked();
    }

    private void OnAttackClicked()
    {
        var battleGrid = FindObjectOfType<BattleGridUI>();
        battleGrid?.OnAttackButtonClicked();
    }

    private void OnDefendClicked()
    {
        var battleGrid = FindObjectOfType<BattleGridUI>();
        battleGrid?.OnDefendButtonClicked();
    }

    private void OnSkillClicked(string skillId)
    {
        var battleGrid = FindObjectOfType<BattleGridUI>();
        battleGrid?.OnSkillButtonClicked(skillId);
    }

    private void OnEndTurnClicked()
    {
        var battleGrid = FindObjectOfType<BattleGridUI>();
        battleGrid?.OnEndTurnClicked();
    }

    private void OnErrorMessage(string message)
    {
        if (_messageText != null)
        {
            _messageText.text = message;
            CancelInvoke(nameof(ClearMessage));
            Invoke(nameof(ClearMessage), 3f);
        }
    }

    private void ClearMessage()
    {
        if (_messageText != null)
            _messageText.text = "";
    }

    private void OnDestroy()
    {
        if (GameClient.Instance != null)
        {
            GameClient.Instance.OnBattleStateUpdated -= OnBattleStateUpdated;
            GameClient.Instance.OnErrorMessage -= OnErrorMessage;
        }
    }
}
