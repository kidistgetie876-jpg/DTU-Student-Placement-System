import React, { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";

const parseYesNo = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  return ["yes", "y", "true", "1", "on"].includes(normalized);
};

const normalizeStream = (value) => {
  const stream = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const singularized = stream.replace(/sciences$/, "science");
  if (singularized === "natural" || singularized === "naturalscience")
    return "naturalscience";
  if (singularized === "social" || singularized === "socialscience")
    return "socialscience";
  return stream;
};

const formatCumulativeScore = (value, cap = 100) => {
  if (value === null || value === undefined || value === "") return "0.00";
  const score = Number(value);
  const scoreCap = Number.isFinite(Number(cap)) ? Math.min(100, Math.max(0, Number(cap))) : 100;
  return Number.isFinite(score) ? Math.min(scoreCap, Math.max(0, score)).toFixed(2) : "0.00";
};

const StudentInformation = ({
  students: initialStudents = [],
  onEditScores,
}) => {
  const [students, setStudents] = useState(initialStudents);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [streamFilter, setStreamFilter] = useState("all");
  const [expandedScoreStudent, setExpandedScoreStudent] = useState(null);
  const itemsPerPage = 5;

  const loadStudents = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await api.get("api/registrar/student_information.php", {
        withCredentials: true,
      });
      const payload = response.data;
      const rows = Array.isArray(payload?.students)
        ? payload.students
        : Array.isArray(payload)
          ? payload
          : [];

      setStudents(rows);
    } catch (error) {
      console.error("Failed to load student records:", error);
      setLoadError(
        error.response?.data?.message || "Unable to load student records.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStudents && initialStudents.length) {
      setStudents(initialStudents);
      return;
    }

    loadStudents();
  }, [initialStudents]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const fieldOfStudy = student?.field_of_study;
      const fields = [
        student?.admission_number,
        student?.given_name,
        student?.father_name,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      const matchesSearch =
        !query || fields.some((value) => value.includes(query));
      const matchesStream =
        streamFilter === "all" ||
        normalizeStream(fieldOfStudy) === streamFilter;
      return matchesSearch && matchesStream;
    });
  }, [students, search, streamFilter]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStudents = filteredStudents.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, streamFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(totalPages, 1));
    }
  }, [currentPage, totalPages]);

  const refreshStudents = async () => {
    await loadStudents();
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        className="card shadow-sm border-0"
        style={{ borderRadius: "16px", overflow: "hidden" }}
      >
        <div
          className="d-flex justify-content-between align-items-center px-4 py-3 text-white"
          style={{ background: "#0c1f4d", borderBottom: "3px solid #f3c84d" }}
        >
          <div>
            <h4 className="mb-0 fw-bold">Student Information</h4>
          </div>

          <div className="d-flex gap-2 align-items-center flex-wrap justify-content-end">
            <select
              className="form-select form-select-sm"
              aria-label="Filter by stream"
              value={streamFilter}
              onChange={(e) => setStreamFilter(e.target.value)}
              style={{ minWidth: "180px" }}
            >
              <option value="all">All Streams</option>
              <option value="naturalscience">Natural Science</option>
              <option value="socialscience">Social Science</option>
            </select>

            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search admission number, given name, or father name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: "260px" }}
            />

            <button
              type="button"
              className="btn btn-light btn-sm fw-semibold"
              onClick={refreshStudents}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="card-body p-0">
          {loadError ? (
            <div className="p-4 text-danger" role="alert">
              {loadError}
            </div>
          ) : loading && students.length === 0 ? (
            <div className="p-4 text-muted">Loading student records...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-4 text-center text-muted">
              No student records found.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table
                  className="table table-hover align-middle mb-0"
                  style={{ minWidth: "1600px" }}
                >
                  <thead className="table-light">
                    <tr>
                      <th>Admission Number</th>
                      <th>First Name</th>
                      <th>Father Name</th>
                      <th>Grandfather Name</th>
                      <th>Sex</th>
                      <th>Region</th>
                      <th>Field of Study</th>
                      <th>Total Mark (G12)</th>
                      <th>CGPA</th>
                      <th>COC</th>
                      <th>Disability</th>
                      <th>Minority</th>
                      <th className="bg-warning text-dark fw-bold text-center">
                        Cumulative Score
                      </th>
                      <th>Placement Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {currentStudents.map((student, index) => {
                      const disabilityFlag = parseYesNo(student.disability);
                      const minorityFlag = student.minority_flag ?? (
                        parseYesNo(student.minority)
                        || parseYesNo(student.developing_region)
                      );
                      const femaleFlag = student.female_flag ?? String(student.sex || "").trim().toLowerCase() === "female";
                      const status = student.placement_status || "Pending";
                      const normalizedPlacementStatus = String(status).trim().toLowerCase();
                      const scoreBreakdown = student.score_breakdown;
                      const scoreExpanded = expandedScoreStudent === student.admission_number;
                      const fieldOfStudy = String(
                        student.field_of_study ||
                          student.fieldOfStudy ||
                          student.FieldOfStudy ||
                          student.Fieldofstudy ||
                          "",
                      ).trim();

                      return (
                        <React.Fragment key={`${student.id ?? student.admission_number ?? student.id_number ?? "student"}-${index}`}>
                        <tr>
                          <td className="fw-bold text-primary">
                            {student.admission_number || "—"}
                          </td>
                          <td>{student.given_name ?? "—"}</td>
                          <td>{student.father_name ?? "—"}</td>
                          <td>{student.grandfather_name ?? "—"}</td>
                          <td>{student.sex || "—"}</td>
                          <td>{student.region || "—"}</td>
                          <td>{fieldOfStudy || "—"}</td>
                          <td className="text-center">
                            {student.total_mark ?? "—"}
                          </td>
                          <td className="text-center">
                            {Number.isFinite(Number(student.cgpa))
                              ? Number(student.cgpa).toFixed(2)
                              : "0.00"}
                          </td>
                          <td className="text-center">
                            {student.coc_score !== null && student.coc_score !== undefined
                              && Number.isFinite(Number(student.coc_score))
                              ? Number(student.coc_score)
                              : "—"}
                          </td>
                          <td className="text-center">
                            <span
                              className={`badge px-2 py-1 ${disabilityFlag ? "bg-danger text-white" : "bg-secondary text-white"}`}
                            >
                              {disabilityFlag ? "Yes" : "No"}
                            </span>
                          </td>

                          <td className="text-center">
                            <span
                              className={`badge px-2 py-1 ${minorityFlag ? "bg-info text-white" : "bg-secondary text-white"}`}
                            >
                              {minorityFlag ? "Yes" : "No"}
                            </span>
                          </td>

                          <td className="text-center fw-bold text-success bg-light" style={{ fontSize: '1.05rem' }}>
                            {formatCumulativeScore(student.cumulative_score, scoreBreakdown?.score_cap)}
                            <button
                              type="button"
                              className="btn btn-link btn-sm d-block mx-auto p-0 mt-1"
                              aria-expanded={scoreExpanded}
                              aria-label={`${scoreExpanded ? "Hide" : "Show"} score breakdown for ${student.admission_number}`}
                              onClick={() => setExpandedScoreStudent(
                                scoreExpanded ? null : student.admission_number,
                              )}
                            >
                              {scoreExpanded ? "Hide breakdown" : "Score breakdown"}
                            </button>
                          </td>

                          <td className="text-center">
                            <span
                              className={`badge px-2 py-1 ${
                                ["placed", "placed in semester 1", "allocated", "approved"].includes(normalizedPlacementStatus)
                                  ? "bg-success text-white"
                                  : normalizedPlacementStatus === "pending"
                                    ? "bg-warning text-dark"
                                    : "bg-secondary text-white"
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="text-center">
                            {onEditScores ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => onEditScores(student)}
                              >
                                Update Scores
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                        {scoreExpanded && (
                          <tr>
                            <td colSpan={15} className="bg-body-tertiary px-4 py-3">
                              <section
                                aria-label={`Cumulative score breakdown for ${student.admission_number}`}
                                className="border rounded bg-white p-3"
                              >
                                <h6 className="fw-bold mb-3">Cumulative Score Breakdown</h6>
                                {scoreBreakdown ? (
                                  <div className="row g-3">
                                    <div className="col-md-4">
                                      <div className="fw-semibold">Base Score</div>
                                      <div>CGPA contribution: {Number(scoreBreakdown.cgpa_contribution).toFixed(2)}</div>
                                      <div>G12 contribution: {Number(scoreBreakdown.grade12_contribution).toFixed(2)}</div>
                                      <div>COC contribution: {Number(scoreBreakdown.coc_contribution).toFixed(2)}</div>
                                      <div className="fw-semibold mt-1">Base total: {Number(scoreBreakdown.base_score).toFixed(2)}</div>
                                    </div>
                                    <div className="col-md-5">
                                      <div className="fw-semibold">Applied Affirmative Action Bonuses</div>
                                      {scoreBreakdown.applied_scenario ? (
                                        <>
                                          <div>Female: {femaleFlag ? "Yes" : "No"}</div>
                                          <div>Minority / developing region{student.region ? ` (${student.region})` : ""}: {minorityFlag ? "Yes" : "No"}</div>
                                          <div>Disability: {disabilityFlag ? "Yes" : "No"}</div>
                                          <div>
                                            Applied rule: {{
                                              minority_male: "Minority / Developing Region (Male)",
                                              minority_female: "Minority / Developing Region (Female)",
                                              minority_disability: "Minority / Developing Region (Disability)",
                                              female_disability_minority: "Female + Disability + Minority",
                                            }[scoreBreakdown.applied_scenario] || scoreBreakdown.applied_scenario}
                                          </div>
                                          <div>Scenario bonus: +{Number(scoreBreakdown.scenario_bonus).toFixed(2)}</div>
                                        </>
                                      ) : (
                                        <>
                                          <div>Female: {femaleFlag ? "Yes" : "No"} ({femaleFlag ? "+" : ""}{Number(scoreBreakdown.female_bonus).toFixed(2)})</div>
                                          <div>
                                            Minority / developing region{student.region ? ` (${student.region})` : ""}: {minorityFlag ? "Yes" : "No"} ({minorityFlag ? "+" : ""}{Number(scoreBreakdown.minority_bonus).toFixed(2)})
                                          </div>
                                          <div>Disability: {disabilityFlag ? "Yes" : "No"} ({disabilityFlag ? "+" : ""}{Number(scoreBreakdown.disability_bonus).toFixed(2)})</div>
                                        </>
                                      )}
                                      <div className="fw-semibold mt-1">Total bonus: +{Number(scoreBreakdown.affirmative_action_bonus).toFixed(2)}</div>
                                    </div>
                                    <div className="col-md-3">
                                      <div className="fw-semibold">Final Cumulative Score</div>
                                      <div>{Number(scoreBreakdown.base_score).toFixed(2)} + {Number(scoreBreakdown.affirmative_action_bonus).toFixed(2)} = <strong>{formatCumulativeScore(scoreBreakdown.cumulative_score, scoreBreakdown.score_cap)}</strong></div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-muted mb-0">Score breakdown is unavailable until CGPA, G12 mark, and COC score are recorded.</p>
                                )}
                              </section>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3 border-top px-3 py-3">
                <p className="mb-0 text-sm text-gray-600">
                  Showing {indexOfFirstItem + 1} to{" "}
                  {Math.min(indexOfLastItem, filteredStudents.length)} of{" "}
                  {filteredStudents.length} entries
                </p>
                <nav
                  className="d-flex align-items-center gap-1"
                  aria-label="Student records pagination"
                >
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm px-3 py-2 rounded-md border-gray-300 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      setCurrentPage((previousPage) =>
                        Math.max(previousPage - 1, 1),
                      )
                    }
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1,
                  ).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`btn btn-sm min-w-9 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                        currentPage === page
                          ? "btn-primary border-blue-600 bg-blue-600 text-white"
                          : "btn-outline-secondary border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Page ${page}`}
                      aria-current={currentPage === page ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm px-3 py-2 rounded-md border-gray-300 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      setCurrentPage((previousPage) =>
                        Math.min(previousPage + 1, totalPages),
                      )
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </nav>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentInformation;