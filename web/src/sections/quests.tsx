import { type AsyncState } from "../lib/api.js";
import {
  splitQuests,
  mainQuestRewardSummary,
  mainQuestObjective,
  mainQuestProgressUnit,
  ratioPercent,
} from "../lib/format.js";
import type { Quest, QuestsResponse } from "../lib/types.js";
import { Async, Badge, Card, EmptyState, ProgressBar } from "../components/ui.js";

const QUEST_TONES: Record<string, string> = {
  easy: "easy",
  normal: "normal",
  hard: "hard",
  boss: "boss",
  raid: "raid",
};

function QuestList({
  quests,
  emptyMessage,
}: {
  quests: Quest[];
  emptyMessage: string;
}) {
  if (quests.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <ul className="quest-list">
      {quests.map((quest) => {
        const percent = ratioPercent(quest.progressCount, quest.targetCount);
        return (
          <li key={quest.id} className="quest">
            <div className="quest-head">
              <span className="quest-title">{quest.title}</span>
              <Badge tone={QUEST_TONES[quest.questType] ?? "normal"}>
                {quest.questType}
              </Badge>
            </div>
            {quest.description ? (
              <p className="quest-desc muted">{quest.description}</p>
            ) : null}
            <div className="quest-foot">
              <ProgressBar percent={percent} />
              <span className="muted">
                {quest.progressCount}/{quest.targetCount} · {mainQuestRewardSummary(quest)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MainQuestList({
  quests,
  emptyMessage,
}: {
  quests: Quest[];
  emptyMessage: string;
}) {
  if (quests.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <ul className="quest-list main-quest-list">
      {quests.map((quest) => {
        const percent = ratioPercent(quest.progressCount, quest.targetCount);
        const objective = mainQuestObjective(quest);
        const progressUnit = mainQuestProgressUnit(quest);
        return (
          <li key={quest.id} className="quest main-quest">
            <div className="quest-head">
              <span className="quest-title main-quest-title">{quest.title}</span>
              <Badge tone={QUEST_TONES[quest.questType] ?? "normal"}>
                {quest.questType}
              </Badge>
            </div>
            <div className="main-quest-id">
              <span className="quest-label">ID</span>
              <span className="muted">{quest.displayId ?? quest.id}</span>
            </div>
            {objective ? (
              <div className="main-quest-objective">
                <span className="quest-label">Objective</span>
                <p className="quest-desc muted">{objective}</p>
              </div>
            ) : null}
            <div className="main-quest-progress">
              <span className="quest-label">Progress</span>
              <span className="muted">
                {quest.progressCount} / {quest.targetCount}
                {progressUnit ? ` ${progressUnit}` : ""}
              </span>
              <ProgressBar percent={percent} />
            </div>
            <div className="main-quest-reward">
              <span className="quest-label">Reward</span>
              <span className="muted">{mainQuestRewardSummary(quest)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DailyQuests({
  quests,
}: {
  quests: AsyncState<QuestsResponse>;
}) {
  return (
    <Card title="Daily Quests" icon="🗡" area="daily">
      <Async state={quests} loadingLabel="Fetching quests…">
        {(data) => (
          <QuestList
            quests={splitQuests(data.quests).daily}
            emptyMessage="No daily quests active. Add an easy or normal quest to begin."
          />
        )}
      </Async>
    </Card>
  );
}

export function MainQuests({ quests }: { quests: AsyncState<QuestsResponse> }) {
  return (
    <Card title="Main Quests" icon="🏰" area="main">
      <Async state={quests} loadingLabel="Fetching quests…">
        {(data) => (
          <MainQuestList
            quests={splitQuests(data.quests).main}
            emptyMessage="No active Main Quest. Choose a major arc to clear."
          />
        )}
      </Async>
    </Card>
  );
}
