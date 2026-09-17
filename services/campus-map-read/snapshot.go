package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"time"
)

var contentRevisionPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type snapshot struct {
	body, compressed, version []byte
	revision                  string
	fetchedAt                 time.Time
}

func (s *snapshot) size() int64 { return int64(len(s.body) + len(s.compressed) + len(s.version)) }

// Nest's TransformInterceptor uses 0; some compatible upstreams use 200.
// A missing/null code must not silently decode to the successful integer zero.
func successCode(raw json.RawMessage) bool {
	var code *int
	return json.Unmarshal(raw, &code) == nil && code != nil && (*code == 0 || *code == 200)
}

// Hash the public payload, not the response timestamp. Live withdrawals can
// change content without changing the formal publication's version ID.
func compileSnapshot(raw []byte, region string, fetchedAt time.Time) (*snapshot, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelope); err != nil || envelope == nil {
		return nil, fmt.Errorf("invalid snapshot JSON")
	}
	data := envelope
	wrapped := envelope["data"] != nil
	if wrapped {
		if !successCode(envelope["code"]) {
			return nil, fmt.Errorf("unsuccessful snapshot envelope")
		}
		data = make(map[string]json.RawMessage)
		if json.Unmarshal(envelope["data"], &data) != nil || data == nil {
			return nil, fmt.Errorf("missing public payload")
		}
	} else if code, present := envelope["code"]; present && !successCode(code) {
		return nil, fmt.Errorf("unsuccessful snapshot payload")
	}
	var enabled bool
	var actualRegion string
	if json.Unmarshal(data["enabled"], &enabled) != nil || json.Unmarshal(data["regionId"], &actualRegion) != nil || actualRegion != region {
		return nil, fmt.Errorf("snapshot region or enabled flag mismatch")
	}
	var workflow struct {
		ActiveVersionID string `json:"activeVersionId"`
	}
	_ = json.Unmarshal(data["workflow"], &workflow)
	if enabled && workflow.ActiveVersionID == "" {
		return nil, fmt.Errorf("enabled map lacks published version")
	}
	for _, key := range []string{"draft", "draftManifest"} {
		if _, found := data[key]; found {
			return nil, fmt.Errorf("draft payload is not publishable")
		}
	}
	// New Nest versions own the digest so direct reads, canaries and manual
	// rollback share one revision (Go and JS encode Unicode/numbers differently).
	var originRevision string
	if rawRevision, exists := data["readRevision"]; exists {
		if json.Unmarshal(rawRevision, &originRevision) != nil || !contentRevisionPattern.MatchString(originRevision) {
			return nil, fmt.Errorf("invalid origin content revision")
		}
	}
	delete(data, "readRevision")
	canonical, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(canonical)
	revision := hex.EncodeToString(digest[:])
	if originRevision != "" {
		revision = originRevision
	}
	data["readRevision"], _ = json.Marshal(revision)
	var body []byte
	if wrapped {
		envelope["data"], _ = json.Marshal(data)
		body, err = json.Marshal(envelope)
	} else {
		body, err = json.Marshal(data)
	}
	if err != nil {
		return nil, err
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err = writer.Write(body); err != nil {
		return nil, err
	}
	if err = writer.Close(); err != nil {
		return nil, err
	}
	versionCode := 0
	if wrapped {
		_ = json.Unmarshal(envelope["code"], &versionCode)
	}
	version, _ := json.Marshal(map[string]any{"code": versionCode, "message": "success", "data": map[string]any{"regionId": region, "enabled": enabled, "activeVersionId": workflow.ActiveVersionID, "readRevision": revision}})
	return &snapshot{body: body, compressed: compressed.Bytes(), version: version, revision: revision, fetchedAt: fetchedAt}, nil
}
