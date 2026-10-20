import React, { useState } from 'react';
import { Profile } from '../../core/models';
import { repository } from '../../core/storage/repository';
import { Plus, Trash2, FileText, Check } from 'lucide-react';

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
      setSaveStatus('Profile saved successfully!');
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
          summary: ''
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
    <div className="space-y-8">
      {/* Contact Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
            <input
              type="text"
              value={formData.contact.firstName}
              onChange={(e) => handleContactChange('firstName', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
            <input
              type="text"
              value={formData.contact.lastName}
              onChange={(e) => handleContactChange('lastName', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={formData.contact.email}
              onChange={(e) => handleContactChange('email', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.contact.phone}
              onChange={(e) => handleContactChange('phone', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Location (City, State, Country)</label>
            <input
              type="text"
              value={formData.contact.location}
              onChange={(e) => handleContactChange('location', e.target.value)}
              placeholder="e.g. San Francisco, California, United States"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">LinkedIn Profile</label>
            <input
              type="url"
              value={formData.contact.linkedin}
              onChange={(e) => handleContactChange('linkedin', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GitHub Profile</label>
            <input
              type="url"
              value={formData.contact.github}
              onChange={(e) => handleContactChange('github', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Website / Portfolio</label>
            <input
              type="url"
              value={formData.contact.website}
              onChange={(e) => handleContactChange('website', e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Work Authorization */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Work Authorization</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Authorized Countries (comma-separated)
            </label>
            <input
              type="text"
              value={formData.workAuthorization.authorizedCountries.join(', ')}
              onChange={(e) =>
                handleWorkAuthChange(
                  'authorizedCountries',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
              placeholder="e.g. United States, Canada"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sponsorship"
              checked={formData.workAuthorization.requiresSponsorship}
              onChange={(e) => handleWorkAuthChange('requiresSponsorship', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="sponsorship" className="text-sm text-slate-700">
              I require current or future visa sponsorship
            </label>
          </div>
        </div>
      </div>

      {/* Resumes */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Resumes</h3>
          <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100">
            <Plus className="h-3.5 w-3.5" />
            Upload PDF
            <input type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} />
          </label>
        </div>

        {profile.resumes.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No resumes uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {profile.resumes.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{r.label}</span>
                      {r.isDefault && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{r.fileName} ({(r.fileSize / 1024).toFixed(1)} KB)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!r.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultResume(r.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Make Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteResume(r.id)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Education</h3>
          <button
            type="button"
            onClick={addEducation}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add School
          </button>
        </div>
        <div className="space-y-4">
          {formData.education.map((edu, idx) => (
            <div key={edu.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 relative">
              <button
                type="button"
                onClick={() => removeEducation(edu.id)}
                className="absolute right-3 top-3 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">School</label>
                  <input
                    type="text"
                    value={edu.school}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].school = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="w-full rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Degree</label>
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].degree = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="w-full rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Field of Study</label>
                  <input
                    type="text"
                    value={edu.field}
                    onChange={(e) => {
                      const updated = [...formData.education];
                      updated[idx].field = e.target.value;
                      setFormData({ ...formData, education: updated });
                    }}
                    className="w-full rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Experience */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Experience</h3>
          <button
            type="button"
            onClick={addExperience}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add Experience
          </button>
        </div>
        <div className="space-y-4">
          {formData.experience.map((exp, idx) => (
            <div key={exp.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 relative">
              <button
                type="button"
                onClick={() => removeExperience(exp.id)}
                className="absolute right-3 top-3 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
                  <input
                    type="text"
                    value={exp.company}
                    onChange={(e) => {
                      const updated = [...formData.experience];
                      updated[idx].company = e.target.value;
                      setFormData({ ...formData, experience: updated });
                    }}
                    className="w-full rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={exp.title}
                    onChange={(e) => {
                      const updated = [...formData.experience];
                      updated[idx].title = e.target.value;
                      setFormData({ ...formData, experience: updated });
                    }}
                    className="w-full rounded border border-slate-300 p-1.5 text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4">
        {saveStatus ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <Check className="h-4 w-4" /> {saveStatus}
          </div>
        ) : <div />}
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};
