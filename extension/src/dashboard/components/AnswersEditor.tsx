import React, { useState } from 'react';
import { StoredAnswer, StoredAnswerCategory } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Plus, Trash2, Sparkles } from 'lucide-react';

interface Props {
  answers: StoredAnswer[];
  onUpdate: () => void;
}

export const AnswersEditor: React.FC<Props> = ({ answers, onUpdate }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState<StoredAnswerCategory>('other');
  const [newAutoFill, setNewAutoFill] = useState(false);

  const filteredAnswers = selectedCategory === 'all'
    ? answers
    : answers.filter((a) => a.category === selectedCategory);

  const handleToggleAutoFill = async (answer: StoredAnswer) => {
    // Sensitive categories require explicit confirmation if turning on autoFill
    if ((answer.category === 'eligibility' || answer.category === 'demographic') && !answer.autoFill) {
      if (!confirm('Warning: Auto-filling legal eligibility or demographic answers is not recommended. Are you sure you want to enable autofill for this answer?')) {
        return;
      }
    }
    await repository.upsertAnswer({ ...answer, autoFill: !answer.autoFill });
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stored answer?')) return;
    await repository.deleteAnswer(id);
    onUpdate();
  };

  const handleCreate = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      alert('Please fill out both the question phrasing and the answer.');
      return;
    }

    const patterns = newQuestion
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    await repository.upsertAnswer({
      id: crypto.randomUUID(),
      questionPatterns: patterns,
      category: newCategory,
      answer: newAnswer.trim(),
      autoFill: newAutoFill
    });

    setIsAdding(false);
    setNewQuestion('');
    setNewAnswer('');
    setNewCategory('other');
    setNewAutoFill(false);
    onUpdate();
  };

  const categoryBadgeColor = (category: StoredAnswerCategory) => {
    switch (category) {
      case 'eligibility':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'demographic':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'motivation':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'logistics':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['all', 'eligibility', 'demographic', 'motivation', 'logistics', 'other'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Answer
        </button>
      </div>

      {/* Add Modal/Card */}
      {isAdding && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm space-y-4">
          <h4 className="text-sm font-semibold text-indigo-900">Add New Stored Answer</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Question Patterns (one per line)
              </label>
              <textarea
                rows={3}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="e.g. How did you hear about this role?&#10;Where did you find this position?"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Answer</label>
              <textarea
                rows={3}
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                placeholder="e.g. Company Website / Careers page"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as StoredAnswerCategory)}
                  className="rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                >
                  <option value="eligibility">Eligibility</option>
                  <option value="demographic">Demographic</option>
                  <option value="motivation">Motivation</option>
                  <option value="logistics">Logistics</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="newAutofill"
                  checked={newAutoFill}
                  onChange={(e) => setNewAutoFill(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="newAutofill" className="text-xs text-slate-700">
                  Allow Autofill without manual confirmation
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Save Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Answers List */}
      {filteredAnswers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-white">
          <p className="text-sm text-slate-500 italic">No stored answers found for this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnswers.map((ans) => (
            <div
              key={ans.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${categoryBadgeColor(ans.category)}`}>
                    {ans.category}
                  </span>
                  {ans.autoFill ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      <Sparkles className="h-3 w-3" /> AutoFill enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Review before filling
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  {ans.questionPatterns.join(' • ')}
                </div>

                <div className="text-sm font-medium text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {ans.answer}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                <button
                  type="button"
                  onClick={() => handleToggleAutoFill(ans)}
                  title="Toggle autofill permission"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border ${
                    ans.autoFill
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ans.autoFill ? 'Disable Autofill' : 'Enable Autofill'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ans.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
