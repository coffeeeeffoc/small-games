import { useState } from 'react';
import {
  assessedOn,
  assessmentBasis,
  implementationLabels,
  rolloutLabel,
  tagLabel,
  type GameAssessment,
} from './catalog-assessments.js';

export function GameAssessmentSummary({ assessment }: { assessment: GameAssessment }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className="game-rollout" aria-label={`${assessment.title}改造排期与状态`}>
        <strong>{rolloutLabel(assessment.schedule)}</strong>
        <span>{implementationLabels[assessment.implementationStatus]}</span>
      </div>
      <div className="game-tags" aria-label={`${assessment.title}标签`}>
        {assessment.potential.map((value) => (
          <span key={value} className={value === 'low' ? 'tag-low' : ''}>
            {tagLabel('potential', value)}
          </span>
        ))}
        <span>{tagLabel('platforms', assessment.primaryPlatform)}优先</span>
        {assessment.genres.slice(0, 2).map((value) => (
          <span key={value}>{tagLabel('genres', value)}</span>
        ))}
      </div>
      <details className="game-assessment" open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setExpanded((open) => !open);
          }}
        >
          查看评估与改进
        </summary>
        {expanded && (
          <>
            <dl>
              <dt>排期理由</dt>
              <dd>{assessment.scheduleReason}</dd>
              <dt>主目标平台</dt>
              <dd>
                {tagLabel('platforms', assessment.primaryPlatform)} ·{' '}
                {assessment.orientation === 'portrait' ? '竖屏' : '横屏'}
              </dd>
              <dt>优点</dt>
              <dd>
                <ul>
                  {assessment.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
              <dt>不足与风险</dt>
              <dd>
                <ul>
                  {assessment.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
              {assessment.delivered.length > 0 && (
                <>
                  <dt>{assessment.schedule === 'previous' ? '上轮已落实' : '已落实改造'}</dt>
                  <dd>
                    <ul>
                      {assessment.delivered.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              <dt>下一步改进</dt>
              <dd>
                <ul>
                  {assessment.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
              <dt>适合拓展</dt>
              <dd>
                {assessment.opportunities
                  .map((value) => tagLabel('opportunities', value))
                  .join(' / ')}
                （不代表已接入）
              </dd>
              <dt>评估依据</dt>
              <dd>
                {assessment.evidence.map((path) => (
                  <code key={path}>{path}</code>
                ))}
              </dd>
            </dl>
            <p className="assessment-basis">
              {assessedOn} · {assessmentBasis}
            </p>
          </>
        )}
      </details>
    </>
  );
}
