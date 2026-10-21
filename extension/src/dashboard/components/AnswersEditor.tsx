import React, { useState } from 'react';
import { StoredAnswer, StoredAnswerCategory } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Plus, Trash2, Sparkles, Pencil, Check, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';

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

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPatterns, setEditPatterns] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editCategory, setEditCategory] = useState<StoredAnswerCategory>('other');
  const [editAutoFill, setEditAutoFill] = useState(false);

  const filteredAnswers = selectedCategory === 'all'
    ? answers
    : answers.filter((a) => a.category === selectedCategory);

  const handleToggleAutoFill = async (answer: StoredAnswer) => {
    if ((answer.category === 'eligibility' || answer.category === 'demographic') && !answer.autoFill) {
      if (!confirm('Warning: Auto-filling legal eligibility or demographic answers is not recommended without review. Are you sure you want to enable autofill for this answer?')) {
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

  const startEdit = (ans: StoredAnswer) => {
    setEditingId(ans.id);
    setEditPatterns(ans.questionPatterns.join('\n'));
    setEditAnswer(ans.answer);
    setEditCategory(ans.category);
    setEditAutoFill(ans.autoFill);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editPatterns.trim() || !editAnswer.trim()) {
      alert('Please fill out both the question phrasing and the answer.');
      return;
    }

    const patterns = editPatterns
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    await repository.upsertAnswer({
      id,
      questionPatterns: patterns,
      category: editCategory,
      answer: editAnswer.trim(),
      autoFill: editAutoFill
    });

    setEditingId(null);
    onUpdate();
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'eligibility', 'demographic', 'motivation', 'logistics', 'other'].map((cat) => (
            <Button
              key={cat}
              type="button"
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="capitalize text-xs font-normal"
            >
              {cat}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={() => setIsAdding(true)}
          className="gap-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Answer
        </Button>
      </div>

      {/* Add Card */}
      {isAdding && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">New Stored Answer</CardTitle>
            <CardDescription>
              Provide patterns or questions Odos should match against, and the default response.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-question">Question Patterns (one per line)</Label>
                <Textarea
                  id="new-question"
                  rows={3}
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. How did you hear about this role?&#10;Where did you find this position?"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-answer">Stored Answer</Label>
                <Textarea
                  id="new-answer"
                  rows={3}
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="e.g. Company Website / Careers page"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-4 border-t border-border/60">
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="new-category" className="text-[11px]">Category</Label>
                  <select
                    id="new-category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as StoredAnswerCategory)}
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  >
                    <option value="eligibility">Eligibility</option>
                    <option value="demographic">Demographic</option>
                    <option value="motivation">Motivation</option>
                    <option value="logistics">Logistics</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 pt-4">
                  <input
                    type="checkbox"
                    id="newAutofill"
                    checked={newAutoFill}
                    onChange={(e) => setNewAutoFill(e.target.checked)}
                    className="h-4 w-4 rounded border-input bg-background text-zinc-950 focus:ring-1 focus:ring-ring cursor-pointer"
                  />
                  <Label htmlFor="newAutofill" className="cursor-pointer text-xs font-normal">
                    Auto-fill without requiring manual review
                  </Label>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                >
                  Save Answer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Answers List */}
      {filteredAnswers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-xs text-muted-foreground italic">No stored answers found for this category.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredAnswers.map((ans) => {
            const isEditing = editingId === ans.id;

            if (isEditing) {
              return (
                <Card key={ans.id} className="border-border bg-card shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-xs font-semibold">Editing Answer</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={cancelEdit}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Question Patterns (one per line)</Label>
                        <Textarea
                          rows={3}
                          value={editPatterns}
                          onChange={(e) => setEditPatterns(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Stored Answer</Label>
                        <Textarea
                          rows={3}
                          value={editAnswer}
                          onChange={(e) => setEditAnswer(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-4 border-t border-border/60">
                      <div className="flex items-center gap-4">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Category</Label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as StoredAnswerCategory)}
                            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                          >
                            <option value="eligibility">Eligibility</option>
                            <option value="demographic">Demographic</option>
                            <option value="motivation">Motivation</option>
                            <option value="logistics">Logistics</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2 pt-4">
                          <input
                            type="checkbox"
                            id={`editAutofill_${ans.id}`}
                            checked={editAutoFill}
                            onChange={(e) => setEditAutoFill(e.target.checked)}
                            className="h-4 w-4 rounded border-input bg-background text-zinc-950 focus:ring-1 focus:ring-ring cursor-pointer"
                          />
                          <Label htmlFor={`editAutofill_${ans.id}`} className="cursor-pointer text-xs font-normal">
                            Auto-fill without requiring manual review
                          </Label>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(ans.id)}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" /> Save Changes
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div
                key={ans.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-zinc-400/60 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider font-normal">
                      {ans.category}
                    </Badge>
                    {ans.autoFill ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground">
                        <Sparkles className="h-3 w-3" /> AutoFill enabled
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Review before fill
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {ans.questionPatterns.join(' • ')}
                  </div>

                  <div className="text-xs text-foreground bg-muted/40 p-2.5 rounded-md border border-border font-mono whitespace-pre-wrap leading-relaxed">
                    {ans.answer || <span className="text-muted-foreground italic font-normal">No answer set</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end md:self-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(ans)}
                    title="Edit question & answer"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleAutoFill(ans)}
                    className="h-8 text-xs font-normal"
                  >
                    {ans.autoFill ? 'Disable Auto' : 'Enable Auto'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(ans.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
