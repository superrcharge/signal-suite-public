package blob

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/bloberror"
)

type Client struct {
	inner      *azblob.Client
	serviceURL string
	container  string
}

func NewClient(serviceURL, container string) (*Client, error) {
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("blob: credential: %w", err)
	}
	c, err := azblob.NewClient(serviceURL, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("blob: client: %w", err)
	}
	return &Client{inner: c, serviceURL: serviceURL, container: container}, nil
}

// UploadStream uploads r to Azure Blob Storage and returns the blob URL.
func (c *Client) UploadStream(ctx context.Context, blobName, contentType string, r io.Reader) (string, error) {
	_, err := c.inner.UploadStream(ctx, c.container, blobName, r, &azblob.UploadStreamOptions{
		HTTPHeaders: &blob.HTTPHeaders{
			BlobContentType: &contentType,
		},
	})
	if err != nil {
		return "", fmt.Errorf("blob: upload %s: %w", blobName, err)
	}
	base := strings.TrimRight(c.serviceURL, "/")
	return fmt.Sprintf("%s/%s/%s", base, c.container, blobName), nil
}

// Download fetches blobName from Azure Blob Storage using the existing credential.
// The caller must close the returned ReadCloser.
func (c *Client) Download(ctx context.Context, blobName string) (io.ReadCloser, string, error) {
	resp, err := c.inner.DownloadStream(ctx, c.container, blobName, nil)
	if err != nil {
		return nil, "", fmt.Errorf("blob: download %s: %w", blobName, err)
	}
	ct := ""
	if resp.ContentType != nil {
		ct = *resp.ContentType
	}
	return resp.Body, ct, nil
}

// Delete removes blobName from the container. A blob that is already absent is
// reported as success so callers can retry a partially-failed delete safely.
func (c *Client) Delete(ctx context.Context, blobName string) error {
	_, err := c.inner.DeleteBlob(ctx, c.container, blobName, nil)
	if err != nil {
		if bloberror.HasCode(err, bloberror.BlobNotFound) {
			return nil
		}
		return fmt.Errorf("blob: delete %s: %w", blobName, err)
	}
	return nil
}

// BlobNameFromURL extracts the blob name from a full blob URL produced by UploadStream.
// Expected format: <serviceURL>/<container>/<blobName>
func (c *Client) BlobNameFromURL(rawURL string) (string, error) {
	base := strings.TrimRight(c.serviceURL, "/")
	prefix := fmt.Sprintf("%s/%s/", base, c.container)
	if !strings.HasPrefix(rawURL, prefix) {
		return "", fmt.Errorf("blob: URL %q does not belong to this client's container", rawURL)
	}
	return strings.TrimPrefix(rawURL, prefix), nil
}
