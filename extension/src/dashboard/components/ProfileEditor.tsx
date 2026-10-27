import React, { useState } from 'react';
import { Profile } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Plus, Trash2, FileText, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface Props {
  profile: Profile;
  onUpdate: () => void;
}

export const ProfileEditor: React.FC<Props> = ({ profile, onUpdate }) => {
  const [formData, setFormData] = useState<Profile>(profile);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleContactChange = (field: keyof Profile['contact'], value: string) => {
    setFormData((prev) => {
      const nextContact = { ...prev.contact, [field]: value };
      if (field === 'firstName' || field === 'lastName') {
        nextContact.fullName = `${nextContact.firstName} ${nextContact.lastName}`.trim();
      }
      return { ...prev, contact: nextContact };
    });
  };

  const handleAddressChange = (field: keyof Profile['contact']['address'], value: string) => {
    setFormData((prev) => ({
      ...prev,
      contact: { ...prev.contact, address: { ...prev.contact.address, [field]: value } }
    }));
  };

  const handlePreferenceChange = (field: keyof Profile['preferences'], value: string) => {
    setFormData((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [field]: value }
    }));
  };

  const handleWorkAuthChange = (field: 'requiresSponsorship' | 'authorizedCountries', value: any) => {
    setFormData((prev) => ({
      ...prev,
      workAuthorization: {
        ...prev.workAuthorization,
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    try {
      await repository.saveProfile(formData);
      setSaveStatus('Profile saved successfully');
      setTimeout(() => setSaveStatus(null), 2500);
      onUpdate();
    } catch (err: any) {
      alert('Error saving profile: ' + err.message);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await repository.saveResume(file, {
        label: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileType: file.type
      });
      onUpdate();
    } catch (err: any) {
      alert('Failed to upload resume: ' + err.message);
    }
  };

  const handleDeleteResume = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resume?')) return;
    await repository.deleteResume(id);
    onUpdate();
  };

  const handleSetDefaultResume = async (id: string) => {
    await repository.setDefaultResume(id);
    onUpdate();
  };

  const addEducation = () => {
    setFormData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          id: crypto.randomUUID(),
          school: '',
          degree: '',
          field: '',
          startDate: '',
          endDate: '',
          gpa: ''
        }
      ]
    }));
  };

  const removeEducation = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id)
    }));
  };

  const addExperience = () => {
    setFormData((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        {
          id: crypto.randomUUID(),
          company: '',
          title: '',
          startDate: '',
          endDate: '',
          summary: '',
          isCurrent: false
        }
      ]
    }));
  };

  const removeExperience = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      experience: prev.experience.filter((e) => e.id !== id)
    }));
  };

  return (
    <div className="space-y-6">
      {/* Contact Section */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Contact Information</CardTitle>
          <CardDescription>Primary personal and contact details used across ATS adapters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                type="text"
                value={formData.contact.firstName}
                onChange={(e) => handleContactChange('firstName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                type="text"
                value={formData.contact.lastName}
                onChange={(e) => handleContactChange('lastName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.contact.email}
                onChange={(e) => handleContactChange('email', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.contact.phone}
                onChange={(e) => handleContactChange('phone', e.target.value)}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="location">Location (City, State, Country)</Label>
              <Input
                id="location"
                type="text"
                value={formData.contact.location}
                onChange={(e) => handleContactChange('location', e.target.value)}
                placeholder="e.g. San Francisco, CA, United States"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                type="url"
                value={formData.contact.linkedin}
                onChange={(e) => handleContactChange('linkedin', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="github">GitHub URL</Label>
              <Input
                id="github"
                type="url"
                value={formData.contact.github}
                onChange={(e) => handleContactChange('github', e.target.value)}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="website">Website / Portfolio URL</Label>
              <Input
                id="website"
                type="url"
                value={formData.contact.website}
                onChange={(e) => handleContactChange('website', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twitter">Twitter / X URL</Label>
              <Input
                id="twitter"
                type="url"
                value={formData.contact.twitter}
                onChange={(e) => handleContactChange('twitter', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                type="text"
                value={formData.contact.pronouns}
                onChange={(e) => handleContactChange('pronouns', e.target.value)}
                placeholder="e.g. they/them"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Address</CardTitle>
          <CardDescription>Structured address used for street, city, state, postal code and country fields.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="addr-line1">Street Address</Label>
              <Input id="addr-line1" type="text" value={formData.contact.address.line1} onChange={(e) => handleAddressChange('line1', e.target.value)} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="addr-line2">Apartment / Suite</Label>
              <Input id="addr-line2" type="text" value={formData.contact.address.line2} onChange={(e) => handleAddressChange('line2', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-city">City</Label>
              <Input id="addr-city" type="text" value={formData.contact.address.city} onChange={(e) => handleAddressChange('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-state">State / Province</Label>
              <Input id="addr-state" type="text" value={formData.contact.address.state} onChange={(e) => handleAddressChange('state', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-postal">Postal Code</Label>
              <Input id="addr-postal" type="text" value={formData.contact.address.postalCode} onChange={(e) => handleAddressChange('postalCode', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-country">Country</Label>
              <Input id="addr-country" type="text" value={formData.contact.address.country} onChange={(e) => handleAddressChange('country', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Availability &amp; Preferences</CardTitle>
          <CardDescription>Answers for start date, notice period, experience, relocation and salary questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pref-availability">Earliest Start / Availability</Label>
              <Input id="pref-availability" type="text" value={formData.preferences.availability} onChange={(e) => handlePreferenceChange('availability', e.target.value)} placeholder="e.g. Immediately, 2 weeks notice, 2026-01-15" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pref-notice">Notice Period</Label>
              <Input id="pref-notice" type="text" value={formData.preferences.noticePeriod} onChange={(e) => handlePreferenceChange('noticePeriod', e.target.value)} placeholder="e.g. 2 weeks" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pref-years">Years of Experience</Label>
              <Input id="pref-years" type="text" value={formData.preferences.yearsExperience} onChange={(e) => handlePreferenceChange('yearsExperience', e.target.value)} placeholder="Blank = derived from your experience dates" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pref-relocate">Willing to Relocate</Label>
              <select
                id="pref-relocate"
                value={formData.preferences.willingToRelocate}
                onChange={(e) => handlePreferenceChange('willingToRelocate', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Not specified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="pref-salary">Salary Expectation (sensitive, only filled when set)</Label>
              <Input id="pref-salary" type="text" value={formData.preferences.salaryExpectation} onChange={(e) => handlePreferenceChange('salaryExpectation', e.target.value)} placeholder="e.g. $150,000" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="pref-cover">Default Cover Letter / Additional Information</Label>
              <Textarea id="pref-cover" rows={4} value={formData.preferences.coverLetterTemplate} onChange={(e) => handlePreferenceChange('coverLetterTemplate', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Authorization */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Work Authorization</CardTitle>
          <CardDescription>Legal eligibility and visa sponsorship preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-countries">Authorized Countries (comma-separated)</Label>
            <Input
              id="auth-countries"
              type="text"
              value={formData.workAuthorization.authorizedCountries.join(', ')}
              onChange={(e) =>
                handleWorkAuthChange(
                  'authorizedCountries',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
              placeholder="e.g. United States, Canada"
            />
          </div>
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="sponsorship"
              checked={formData.workAuthorization.requiresSponsorship}
              onChange={(e) => handleWorkAuthChange('requiresSponsorship', e.target.checked)}
              className="h-4 w-4 rounded border-input bg-background text-zinc-950 focus:ring-1 focus:ring-ring cursor-pointer"
            />
            <Label htmlFor="sponsorship" className="cursor-pointer font-normal">
              I require current or future visa sponsorship
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Resumes */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Resumes</CardTitle>
            <CardDescription>PDF resumes stored in IndexedDB for autofill attachment.</CardDescription>
          </div>
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild className="gap-1.5 cursor-pointer">
              <span>
                <Plus className="h-3.5 w-3.5" /> Upload PDF
              </span>
            </Button>
            <input type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} />
          </label>
        </CardHeader>
        <CardContent>
          {profile.resumes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No resumes uploaded yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {profile.resumes.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{r.label}</span>
                        {r.isDefault && (
                          <Badge variant="default" className="text-[9px] py-0 px-1.5 font-mono">
                            Default
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {r.fileName} • {(r.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!r.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefaultResume(r.id)}
                        className="h-7 text-xs font-normal text-muted-foreground"
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteResume(r.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Education */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Education</CardTitle>
            <CardDescription>Degrees, schools, and academic background.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addEducation} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add School
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.education.map((edu, idx) => (
            <div key={edu.id} className="rounded-lg border border-border bg-muted/30 p-3.5 relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEducation(edu.id)}
                className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-8">
                <div className="space-y-1">
                  <Label className="text-[11px]">School / University</Label>
                  <Input
                    type="text"
                    value={edu.school}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].school = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Degree</Label>
                  <Input
                    type="text"
                    value={edu.degree}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].degree = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Field of Study</Label>
                  <Input
                    type="text"
                    value={edu.field}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].field = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Start (YYYY-MM)</Label>
                  <Input type="text" value={edu.startDate} onChange={(e) => { const updated = [...formData.education]; updated[idx].startDate = e.target.value; setFormData({ ...formData, education: updated }); }} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">End (YYYY-MM)</Label>
                  <Input type="text" value={edu.endDate} onChange={(e) => { const updated = [...formData.education]; updated[idx].endDate = e.target.value; setFormData({ ...formData, education: updated }); }} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">GPA</Label>
                  <Input type="text" value={edu.gpa} onChange={(e) => { const updated = [...formData.education]; updated[idx].gpa = e.target.value; setFormData({ ...formData, education: updated }); }} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Experience */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Experience</CardTitle>
            <CardDescription>Professional roles and employment history.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addExperience} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Experience
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.experience.map((exp, idx) => (
            <div key={exp.id} className="rounded-lg border border-border bg-muted/30 p-3.5 relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeExperience(exp.id)}
                className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                <div className="space-y-1">
                  <Label className="text-[11px]">Company</Label>
                  <Input
                    type="text"
                    value={exp.company}
                    onChange={(e) => {
                      const updated = [...formData.experience];
                      updated[idx].company = e.target.value;
                      setFormData({ ...formData, experience: updated });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Title</Label>
                  <Input
                    type="text"
                    value={exp.title}
                    onChange={(e) => {
                      const updated = [...formData.experience];
                      updated[idx].title = e.target.value;
                      setFormData({ ...formData, experience: updated });
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Start (YYYY-MM)</Label>
                  <Input type="text" value={exp.startDate} onChange={(e) => { const updated = [...formData.experience]; updated[idx].startDate = e.target.value; setFormData({ ...formData, experience: updated }); }} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">End (YYYY-MM)</Label>
                  <Input type="text" value={exp.endDate} disabled={exp.isCurrent} onChange={(e) => { const updated = [...formData.experience]; updated[idx].endDate = e.target.value; setFormData({ ...formData, experience: updated }); }} className="h-8 text-xs" />
                </div>
                <div className="md:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id={`exp-current-${exp.id}`}
                    checked={exp.isCurrent}
                    onChange={(e) => { const updated = [...formData.experience]; updated[idx].isCurrent = e.target.checked; setFormData({ ...formData, experience: updated }); }}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={`exp-current-${exp.id}`} className="text-[11px] font-normal cursor-pointer">I currently work here</Label>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save Bottom Bar */}
      <div className="flex items-center justify-between pt-2">
        {saveStatus ? (
          <div className="flex items-center gap-1.5 text-xs text-foreground bg-muted border border-border px-2.5 py-1 rounded-md">
            <Check className="h-3.5 w-3.5" /> {saveStatus}
          </div>
        ) : <div />}
        <Button onClick={handleSave} className="px-5 font-medium">
          Save Changes
        </Button>
      </div>
    </div>
  );
};
