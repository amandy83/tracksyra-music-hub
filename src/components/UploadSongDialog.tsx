import UploadReleaseDialog from "./UploadReleaseDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

/**
 * @deprecated Use UploadReleaseDialog. Kept as a compatibility entrypoint so
 * existing Dashboard/Admin imports continue to work while all new writes use
 * the unified MusicRelease release+track pipeline.
 */
const UploadSongDialog = (props: Props) => {
  return <UploadReleaseDialog {...props} />;
};

export default UploadSongDialog;
